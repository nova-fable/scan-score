mod build_support;

fn main() {
    println!("cargo:rerun-if-changed=icons");
    println!("cargo:rerun-if-changed=build_support.rs");
    let out_dir =
        std::path::PathBuf::from(std::env::var_os("OUT_DIR").expect("未设置 Cargo OUT_DIR"));
    build_support::prepare_resource_overwrite(&out_dir)
        .unwrap_or_else(|error| panic!("准备覆盖引擎构建副本失败: {error}"));
    tauri_build::build()
}
