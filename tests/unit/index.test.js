const assert = require("assert");
const RustPlugin = require("../../index.js");
const path = require("path");
const Serverless = require("serverless/lib/Serverless");

describe("RustPlugin", () => {
  let plugin;
  let unconfiguredPlugin;

  beforeEach(() => {
    const a = new Serverless();
    const b = new Serverless();

    const pA = a.init().then(() => {
      a.service.custom.rust = { cargoFlags: "--features foo" };

      plugin = new RustPlugin(a, {});
    });

    const pB = b.init().then(() => {
      unconfiguredPlugin = new RustPlugin(b, {});
    });

    return Promise.all([pA, pB]);
  });

  it("registers expected lifecycle hooks", () => {
    assert.deepEqual(Object.keys(plugin.hooks), [
      "before:package:createDeploymentArtifacts",
      "after:package:createDeploymentArtifacts",
    ]);
  });

  it("sets sensible defaults", () => {
    assert.deepEqual(unconfiguredPlugin.custom, {
      cargoFlags: "",
    });
  });

  it("uses services.custom.rust for default overrides", () => {
    assert.deepEqual(plugin.custom, {
      cargoFlags: "--features foo",
    });
  });

  it("resolves cargoBinary from handler name", () => {
    assert.deepEqual(plugin.cargoBinary({ handler: "foo" }), {
      cargoPackage: "foo",
      binary: "foo",
    });

    assert.deepEqual(plugin.cargoBinary({ handler: "foo.bar" }), {
      cargoPackage: "foo",
      binary: "bar",
    });
  });

  it("configures expected localBuildArgs", () => {
    assert.deepEqual(
      plugin.localBuildArgs("--features foo", "foo", "release", "linux"),
      [
        "build",
        "-p",
        "foo",
        "--release",
        "--target",
        "x86_64-unknown-linux-musl",
        "--features",
        "foo",
      ],
      "failed on linux"
    );
    assert.deepEqual(
      plugin.localBuildArgs("--features foo", "foo", "release", "darwin"),
      [
        "build",
        "-p",
        "foo",
        "--release",
        "--target",
        "x86_64-unknown-linux-musl",
        "--features",
        "foo",
      ],
      "failed on osx"
    );
    assert.deepEqual(
      plugin.localBuildArgs("--features foo", "foo", "release", "win32"),
      [
        "build",
        "-p",
        "foo",
        "--release",
        "--target",
        "x86_64-unknown-linux-musl",
        "--features",
        "foo",
      ],
      "failed on windows"
    );
  });

  it("configures expected localBuildEnv", () => {
    assert.deepEqual(plugin.localBuildEnv({}, "linux"), {}, "failed on linux");
    assert.deepEqual(
      plugin.localBuildEnv({}, "darwin"),

      {
        CC_x86_64_unknown_linux_musl: "x86_64-linux-musl-gcc",
        RUSTFLAGS: " -Clinker=x86_64-linux-musl-gcc",
        TARGET_CC: "x86_64-linux-musl-gcc",
      },
      "failed on osx"
    );
    assert.deepEqual(
      plugin.localBuildEnv({}, "win32"),
      {
        CC_x86_64_unknown_linux_musl: "rust-lld",
        RUSTFLAGS: " -Clinker=rust-lld",
        TARGET_CC: "rust-lld",
      },
      "failed on windows"
    );
  });

  it("configures expected localSourceDir", () => {
    assert.equal(
      plugin.localSourceDir("dev", "linux"),
      path.join("target", "x86_64-unknown-linux-musl", "debug"),
      "failed on linux"
    );
    assert.equal(
      plugin.localSourceDir("release", "linux"),
      path.join("target", "x86_64-unknown-linux-musl", "release"),
      "failed on linux"
    );
    assert.equal(
      plugin.localSourceDir("dev", "darwin"),
      path.join("target", "x86_64-unknown-linux-musl", "debug"),
      "failed on osx"
    );
    assert.equal(
      plugin.localSourceDir("release", "darwin"),
      path.join("target", "x86_64-unknown-linux-musl", "release"),
      "failed on osx"
    );
    assert.equal(
      plugin.localSourceDir("dev", "win32"),
      path.join("target", "x86_64-unknown-linux-musl", "debug"),
      "failed on windows"
    );
    assert.equal(
      plugin.localSourceDir("release", "win32"),
      path.join("target", "x86_64-unknown-linux-musl", "release"),
      "failed on windows"
    );
  });
});
