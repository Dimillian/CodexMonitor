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
          pkgs.gtk3
          pkgs.libxkbcommon
          pkgs.librsvg
          pkgs.libsoup_3
          pkgs.webkitgtk_4_1
        ];

        frontend = pkgs.buildNpmPackage {
          pname = "codex-monitor-frontend";
          version = packageJson.version;
          src = ./.;
          nodejs = pkgs.nodejs_20;
          npmDepsHash = "sha256-TT9Po/VVzuObcqAkv4HoRSo41IMvouorlPnPTabxcTA=";
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
            pkgs.pkg-config
          ];

          buildInputs = [
            pkgs.openssl
          ] ++ linuxPackages;

          TAURI_CONFIG = tauriConfig;

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
          ] ++ linuxPackages;

          shellHook = ''
            export RUST_SRC_PATH=${pkgs.rustPlatform.rustLibSrc}
          '';
        };

        formatter = pkgs.alejandra;

        packages.default = appPackage;
      });
}
