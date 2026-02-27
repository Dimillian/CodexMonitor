{
  description = "CodexMonitor Tauri app for orchestrating Codex agents";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixpkgs-unstable";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs = { self, nixpkgs, flake-utils }:
    flake-utils.lib.eachDefaultSystem (system:
      let
        pkgs = import nixpkgs { inherit system; };
        packageJson = builtins.fromJSON (builtins.readFile ./package.json);

        linuxPackages = pkgs.lib.optionals pkgs.stdenv.isLinux [
          pkgs.alsa-lib
          pkgs.glib-networking
          pkgs.gtk3
          pkgs.libayatana-appindicator
          pkgs.librsvg
          pkgs.libsoup_3
          pkgs.libxkbcommon
          pkgs.webkitgtk_4_1
        ];

        frontend = pkgs.buildNpmPackage {
          pname = "codex-monitor-frontend";
          version = packageJson.version;
          src = ./.;
          nodejs = pkgs.nodejs_20;
          npmDepsHash = "sha256-W+xAg0vHbL+8P2Xm2w99JM13UBlCO/pHyzVhCb7blDU=";
          npmBuildScript = "build";
          installPhase = ''
            mkdir -p $out
            cp -R dist $out/
          '';
        };

        tauriConfig = builtins.toJSON {
          build = {
            frontendDist = "dist";
            devUrl = null;
          };
        };

        appPackage = pkgs.rustPlatform.buildRustPackage {
          pname = "codex-monitor";
          version = packageJson.version;
          src = ./src-tauri;

          cargoLock = {
            lockFile = ./src-tauri/Cargo.lock;
            outputHashes = {
              "fix-path-env-0.0.0" = "sha256-UygkxJZoiJlsgp8PLf1zaSVsJZx1GGdQyTXqaFv3oGk=";
            };
          };

          nativeBuildInputs = [
            pkgs.cargo-tauri
            pkgs.cmake
            pkgs.llvmPackages.libclang
            pkgs.perl
            pkgs.pkg-config
          ] ++ pkgs.lib.optionals pkgs.stdenv.isLinux [
            pkgs.wrapGAppsHook3
          ];

          buildInputs = [
            pkgs.openssl
          ] ++ linuxPackages;

          TAURI_CONFIG = tauriConfig;

          LIBCLANG_PATH = "${pkgs.llvmPackages.libclang.lib}/lib";

          preBuild = ''
            mkdir -p dist
            cp -R ${frontend}/dist/. dist
          '';

          cargoBuildFlags = [
            "--features"
            "custom-protocol"
          ];

          installPhase = ''
            mkdir -p $out/bin
            target_dir="target/${pkgs.stdenv.hostPlatform.rust.rustcTarget}"
            cp "$target_dir/release/codex-monitor" $out/bin/
          '';
        };
      in
      {
        devShells.default = pkgs.mkShell {
          packages = [
            pkgs.cargo
            pkgs.clang
            pkgs.cmake
            pkgs.git
            pkgs.nodejs_20
            pkgs.openssl
            pkgs.pkg-config
            pkgs.rust-analyzer
            pkgs.rustc
            pkgs.rustfmt
            pkgs.rustPlatform.rustLibSrc
          ] ++ pkgs.lib.optionals pkgs.stdenv.isLinux [
            pkgs.llvmPackages.libclang
          ] ++ linuxPackages;

          shellHook = ''
            export RUST_SRC_PATH=${pkgs.rustPlatform.rustLibSrc}
          '' + pkgs.lib.optionalString pkgs.stdenv.isLinux ''
            export LIBCLANG_PATH="${pkgs.llvmPackages.libclang.lib}/lib"
            export LD_LIBRARY_PATH="${pkgs.lib.makeLibraryPath linuxPackages}:$LD_LIBRARY_PATH"
            export GIO_MODULE_PATH="${pkgs.glib-networking}/lib/gio/modules"
          '';
        };

        formatter = pkgs.alejandra;

        packages.default = appPackage;
      });
}
