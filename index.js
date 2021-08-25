const { spawnSync } = require("child_process");
const { platform } = require("os");
const path = require("path");
const { copyFileSync, rmSync, existsSync } = require("fs");

const NO_OUTPUT_CAPTURE = { stdio: ["ignore", process.stdout, process.stderr] };
const MUSL_PLATFORMS = ["darwin", "win32", "linux"];

class RustPlugin {
  constructor(serverless, options) {
    this.serverless = serverless;
    this.options = options;

    // We only work with AWS (at the moment)
    this.provider = this.serverless.getProvider("aws");

    // We build the binary when creating artifacts
    this.hooks = {
      "before:package:createDeploymentArtifacts": this.build.bind(this),
      "after:package:createDeploymentArtifacts": this.clean.bind(this),
    };

    // This plugin provides new functions level properties
    this.serverless.configSchemaHandler.defineFunctionProperties("aws", {
      properties: {
        rust: {
          type: "object",
          properties: {
            cargoFlags: { type: "string" },
            profile: { type: "string" },
            rewriteBootstrap: { type: "boolean" },
          },
          required: [],
        },
      },
      required: [],
    });

    // Save the default arguments
    this.custom = Object.assign(
      { cargoFlags: "" },
      (this.serverless.service.custom && this.serverless.service.custom.rust) ||
        {}
    );

    // TODO Decide if we keep that in the plugin or not
    // By default, Serverless examines node_modules to figure out which
    // packages there are from dependencies versus devDependencies of a
    // package. While there will always be a node_modules due to Serverless
    // and this plugin being installed, it will be excluded anyway.
    // Therefore, the filtering can be disabled to speed up (~3.2s) the process.
    this.serverless.service.package.excludeDevDependencies = false;
  }

  // TODO document: handler convention
  cargoBinary(func) {
    let [cargoPackage, binary] = func.handler.split(".");
    if (binary == undefined) {
      binary = cargoPackage;
    }
    return { cargoPackage, binary };
  }

  // TODO document: create arguments to pass to cargo
  localBuildArgs(cargoFlags, cargoPackage, profile, platform) {
    const defaultArgs = ["build", "-p", cargoPackage];
    const profileArgs = profile !== "dev" ? ["--release"] : [];
    const cargoArgs = cargoFlags.split(/\s+/);
    const targetArgs = MUSL_PLATFORMS.includes(platform)
      ? ["--target", "x86_64-unknown-linux-musl"]
      : [];
    return [...defaultArgs, ...profileArgs, ...targetArgs, ...cargoArgs].filter(
      (i) => i
    );
  }

  // TODO document: create env var to pass to cargo
  localBuildEnv(env, platform) {
    const defaultEnv = { ...env };
    const platformEnv =
      "win32" === platform
        ? {
            RUSTFLAGS: (env["RUSTFLAGS"] || "") + " -Clinker=rust-lld",
            TARGET_CC: "rust-lld",
            CC_x86_64_unknown_linux_musl: "rust-lld",
          }
        : "darwin" === platform
        ? {
            RUSTFLAGS:
              (env["RUSTFLAGS"] || "") + " -Clinker=x86_64-linux-musl-gcc",
            TARGET_CC: "x86_64-linux-musl-gcc",
            CC_x86_64_unknown_linux_musl: "x86_64-linux-musl-gcc",
          }
        : {};
    return {
      ...defaultEnv,
      ...platformEnv,
    };
  }

  // TODO document
  localBuild(cargoFlags, cargoPackage, profile) {
    const args = this.localBuildArgs(
      cargoFlags,
      cargoPackage,
      profile,
      platform()
    );

    const env = this.localBuildEnv(process.env, platform());
    this.serverless.cli.log(`Running local cargo build on ${platform()}`);

    const buildResult = spawnSync("cargo", args, {
      ...NO_OUTPUT_CAPTURE,
      ...{
        env: env,
      },
    });

    return buildResult;
  }

  // TODO document
  localSourceDir(profile, platform) {
    let executable = "target";
    if (MUSL_PLATFORMS.includes(platform)) {
      executable = path.join(executable, "x86_64-unknown-linux-musl");
    }
    return path.join(executable, profile !== "dev" ? "release" : "debug");
  }

  /**
   * Copy the file at `sourcePath` to `destPath`, creating missing directory at the
   * source and failing if the target path already exists.
   *
   * @param {*} sourcePath
   * @param {*} destPath
   */
  copyBootstrap(profile, platform, binary, rewriteBootstrap) {
    let executable = "target";
    if (MUSL_PLATFORMS.includes(platform)) {
      executable = path.join(executable, "x86_64-unknown-linux-musl");
    }
    const sourcePath = path.join(
      executable,
      profile !== "dev" ? "release" : "debug",
      binary
    );
    const destPath = "bootstrap";

    if (existsSync(destPath)) {
      if (rewriteBootstrap) {
        rmSync(destPath);
      } else {
        throw new Error(
          "bootstrap file already exists. The Rust plugin will not override it."
        );
      }
    }

    copyFileSync(sourcePath, destPath);
  }

  build() {
    const service = this.serverless.service;

    // Only support AWS at the moment
    if (service.provider.name != "aws") {
      return;
    }

    const individuallyPackaged = service.package.individually || false;
    let bootstrapAddedInGlobalPatterns = 0;

    for (const functionName of this.functions()) {
      const func = service.getFunction(functionName);

      console.log(JSON.stringify(func));

      // Skip over the non-rust functions

      const runtime = func.runtime || service.provider.runtime;
      const isRust = func.rust;

      const isProvidedRuntime =
        runtime === "provided" || runtime === "provided.al2";

      if (!isRust) {
        console.log(`Function ${functionName} not in rust`); // TODO Remove me
        continue;
      }

      if (!isProvidedRuntime) {
        this.serverless.cli.log(
          `Function ${functionName} is declared as rust but doesn't use a provided runtime. Skipping.`,
          "Rust Plugin"
        );
        continue;
      }

      this.serverless.cli.log(`Building rust function '${functionName}'...`);

      // Prepare configuration
      const profile = (func.rust || {}).profile || this.custom.profile;
      const { cargoPackage, binary } = this.cargoBinary(func);
      const cargoFlags =
        (func.rust || {}).cargoFlags || this.custom.cargoFlags || "";
      const rewriteBootstrap =
        (func.rust || {}).rewriteBootstrap ||
        this.custom.rewriteBootstrap ||
        "";

      // Building the binary using cargo and cross-compilation
      const buildResult = this.localBuild(cargoFlags, cargoPackage, profile);

      if (buildResult.error || buildResult.status > 0) {
        this.serverless.cli.log(
          `Rust build encountered an error: ${buildResult.error} ${buildResult.status}.`
        );
        throw new Error(buildResult.error);
      }

      // Copy binary as bootstrap
      this.copyBootstrap(profile, platform(), binary, rewriteBootstrap);
      func.cleanBootstrap = true;

      // Register bootstrap in list of files to include in package
      // TODO 2+ bootstrap will fail because we create all the binaries
      // before packaging. Maybe the package stage needs to be overridden
      // to support multiple functions after all :(
      if (individuallyPackaged) {
        const pkg = func.package || {};
        const patterns = pkg.patterns || [];
        patterns.push("bootstrap");
        pkg.patterns = patterns;
        func.package = pkg;
      } else {
        const patterns = service.package.patterns || [];
        patterns.push("bootstrap");
        service.package.patterns = patterns;
        bootstrapAddedInGlobalPatterns++;
      }
    }

    if (bootstrapAddedInGlobalPatterns > 1) {
      this.serverless.cli.log(
        "Added more than one bootstrap binary in package. Behavior will be undefined."
      );
    }
  }

  clean() {
    const service = this.serverless.service;

    // Only support AWS at the moment
    if (service.provider.name != "aws") {
      return;
    }

    for (const functionName of this.functions()) {
      const func = service.getFunction(functionName);

      // Skip over the non-rust functions

      if (!func.rust) {
        console.log(`Function ${functionName} not in rust`); // TODO Remove me
        continue;
      }

      if (func.cleanBootstrap) {
        this.serverless.cli.log(`Cleaning rust function '${functionName}'...`);
        rmSync("bootstrap");
      }
    }
  }

  functions() {
    if (this.options.function) {
      return [this.options.function];
    } else {
      return this.serverless.service.getAllFunctions();
    }
  }
}

module.exports = RustPlugin;
