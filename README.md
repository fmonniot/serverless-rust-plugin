# serverless-rust


<p align="center">
   A ⚡ <a href="https://www.serverless.com/framework/docs/">Serverless framework</a> ⚡ plugin for <a href="https://www.rust-lang.org/">Rust</a> applications
   <br/>
   Inspired by −and somewhat forked from− the awesome <a href="https://github.com/softprops/serverless-rust"><code>softprops/serverless-rust</code></a>.
</p>

<div align="center">
  <a href="https://github.com/fmonniot/serverless-rust-plugin/actions">
    <img alt="GitHub actions build badge" src="https://github.com/fmonniot/serverless-rust-plugin/actions/workflows/main.yml/badge.svg"/>
  </a>
</div>

<hr>

Why new plugin:
- No custom runtime (deprecated)
- No assumptions on what the zip archive contains (instead rely on the [patterns] mechanism)
- Use native cross compilation by default (perhaps offer cross as an alternative)

## Install

Install the plugin inside your serverless project with npm.

```sh
$ npm i -D fmonniot/serverless-rust-plugin
```
💡The `-D` flag adds it to your development dependencies in npm speak

💡 This plugin assumes you are building Rustlang lambdas targeting the AWS Lambda "provided" runtime. The [AWS Lambda Rust Runtime](https://github.com/awslabs/aws-lambda-rust-runtime) makes this easy.

Add the following to your serverless project's `serverless.yml` file

```yaml
service: demo
provider:
  name: aws
  runtime: provided.al2 # or provided

plugins:
  # this registers the plugin
  # with serverless
  - serverless-rust

# creates one artifact for each function
package:
  individually: true

functions:
  test:
    # handler value syntax is `{cargo-package-name}.{bin-name}`
    # or `{cargo-package-name}` for short when you are building a
    # default bin for a given package.
    handler: your-cargo-package-name
    # Indicates this is a rust function. Use an empty object when
    # you want to use the default values.
    rust: {}
    events:
      - http:
          path: /test
          method: GET
```

> 💡 The Rust Lambda runtime requires a binary named `bootstrap`. This plugin renames the binary cargo builds to `bootstrap` for you. You do **not** need to do this manually in your `Cargo.toml` configuration file. Note that at the moment, the plugin will put the `bootstrap` file in the root project during packaging. If an existing file with the same name already exists, the packaging will fail.

The default behavior is to build your lambda as a static binary outside a container that can be deployed in to the lambda execution environment using [MUSL].

In order to use this mode its expected that you install the `x86_64-unknown-linux-musl` target on all platforms locally with

```sh
$ rustup target add x86_64-unknown-linux-musl
```

On linux platforms, you will need to install musl-tools

```sh
$ sudo apt-get update && sudo apt-get install -y musl-tools
```

On macOS, you will need to install a MUSL cross compilation toolchain

```sh
$ brew install filosottile/musl-cross/musl-cross
```

Using MUSL comes with some other notable tradeoffs. One of which is complications that arise when depending on dynamically linked dependencies.

* With OpenSSL bindings which you can safely replace is with [rustls] or [vendor it](https://docs.rs/openssl/0.10.29/openssl/#vendored)
* Other limitations are noted [here](https://github.com/KodrAus/rust-cross-compile#limitations).

## 🖍️ customize


You can optionally adjust the default settings of the plugin a custom section of your serverless.yaml configuration:

```yaml
custom:
  # this section customizes of the default
  # serverless-rust plugin settings
  rust:
    # flags passed to cargo
    cargoFlags: '--features enable-awesome'
    # compile in release or debug mode.
    # dev means --debug, anything else is release.
    profile: 'dev' # 
    # rewrite the `bootstrap` file if there is one.
    rewriteBootstrap: false
```


### 🎨 Per function customization

If your serverless project contains multiple functions, you may sometimes
need to customize the options above at the function level. You can do this
by using the `rust` key with the same options inline in your function
specification.

```yaml
functions:
  test:
    rust:
      # function specific flags passed to cargo
      cargoFlags: '--features enable-awesome'
    # handler value syntax is `{cargo-package-name}.{bin-name}`
    # or `{cargo-package-name}` for short when you are building a
    # default bin for a given package.
    handler: your-cargo-package-name
    events:
      - http:
          path: /test
          method: GET
```


## 🤸 usage

Every [serverless workflow command] should work out of the box.

### invoke your lambdas locally

```sh
$ npx serverless invoke local -f hello -d '{"hello":"world"}'
```

### deploy your lambdas to the cloud

```sh
$ npx serverless deploy
```

### invoke your lambdas in the cloud directly

```sh
$ npx serverless invoke -f hello -d '{"hello":"world"}'
```

### view your lambdas logs

```sh
$ npx serverless logs -f hello
```


## Credits & License

Licensed under the MIT license.

This work is adapted from [softprops/serverless-rust]. Doug Tangren (softprops) 2018-2019.

Adaptation by François Monniot (fmonniot) 2021.



[patterns]: https://www.serverless.com/framework/docs/providers/aws/guide/packaging/#patterns
[softprops/serverless-rust]: https://github.com/softprops/serverless-rust
[rustls]: https://github.com/ctz/rustls
[MUSL]: https://doc.rust-lang.org/edition-guide/rust-2018/platform-and-target-support/musl-support-for-fully-static-binaries.html
[serverless workflow command]: https://serverless.com/framework/docs/providers/aws/guide/workflow/
