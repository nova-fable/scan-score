#![cfg(unix)]

#[path = "../build_support.rs"]
mod build_support;

use std::{
    fs,
    os::unix::{fs::PermissionsExt, fs::symlink},
    path::PathBuf,
    sync::atomic::{AtomicU64, Ordering},
    time::{SystemTime, UNIX_EPOCH},
};

static NEXT_FIXTURE: AtomicU64 = AtomicU64::new(0);

struct Fixture {
    root: PathBuf,
    out_dir: PathBuf,
    resources: PathBuf,
}

impl Fixture {
    fn new() -> Self {
        let id = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let root = std::env::temp_dir().join(format!(
            "scan-score-build-{}-{id}-{}",
            std::process::id(),
            NEXT_FIXTURE.fetch_add(1, Ordering::Relaxed)
        ));
        let out_dir = root.join("debug/build/scan-score-test/out");
        let resources = root.join("debug/resources/engine");
        fs::create_dir_all(&out_dir).unwrap();
        Self {
            root,
            out_dir,
            resources,
        }
    }
}

impl Drop for Fixture {
    fn drop(&mut self) {
        fs::remove_dir_all(&self.root).unwrap();
    }
}

#[test]
fn prepares_read_only_copies_on_every_build_without_changing_sources() {
    let fixture = Fixture::new();
    let source = fixture.root.join("LICENSE");
    let destination = fixture.resources.join("Audiveris.app/LICENSE");
    fs::write(&source, "license text").unwrap();
    fs::set_permissions(&source, fs::Permissions::from_mode(0o444)).unwrap();
    fs::create_dir_all(destination.parent().unwrap()).unwrap();

    for _ in 0..2 {
        fs::copy(&source, &destination).unwrap();
        assert!(fs::metadata(&destination).unwrap().permissions().readonly());
        build_support::prepare_resource_overwrite(&fixture.out_dir).unwrap();
        assert_eq!(
            fs::metadata(&destination).unwrap().permissions().mode() & 0o777,
            0o644
        );
        assert_eq!(fs::read(&destination).unwrap(), b"license text");
        assert_eq!(
            fs::metadata(&source).unwrap().permissions().mode() & 0o777,
            0o444
        );
    }
}

#[test]
fn preserves_executable_bits_and_unrelated_outputs() {
    let fixture = Fixture::new();
    fs::create_dir_all(&fixture.resources).unwrap();
    let executable = fixture.resources.join("launcher");
    let unrelated = fixture.root.join("debug/unrelated");
    fs::write(&executable, "launcher").unwrap();
    fs::write(&unrelated, "unrelated").unwrap();
    fs::set_permissions(&executable, fs::Permissions::from_mode(0o555)).unwrap();
    fs::set_permissions(&unrelated, fs::Permissions::from_mode(0o444)).unwrap();

    build_support::prepare_resource_overwrite(&fixture.out_dir).unwrap();

    assert_eq!(
        fs::metadata(&executable).unwrap().permissions().mode() & 0o777,
        0o755
    );
    assert_eq!(
        fs::metadata(&unrelated).unwrap().permissions().mode() & 0o777,
        0o444
    );
}

#[test]
fn skips_symbolic_links_to_files_and_directories() {
    let fixture = Fixture::new();
    let outside = fixture.root.join("source");
    fs::create_dir_all(&outside).unwrap();
    fs::create_dir_all(&fixture.resources).unwrap();
    let source = outside.join("LICENSE");
    fs::write(&source, "license text").unwrap();
    fs::set_permissions(&source, fs::Permissions::from_mode(0o444)).unwrap();
    symlink(&source, fixture.resources.join("file-link")).unwrap();
    symlink(&outside, fixture.resources.join("directory-link")).unwrap();

    build_support::prepare_resource_overwrite(&fixture.out_dir).unwrap();

    assert_eq!(
        fs::metadata(&source).unwrap().permissions().mode() & 0o777,
        0o444
    );
    assert!(
        fs::symlink_metadata(fixture.resources.join("file-link"))
            .unwrap()
            .is_symlink()
    );
}

#[test]
fn rejects_resource_paths_outside_the_cargo_output_directory() {
    let fixture = Fixture::new();
    let outside = fixture.root.join("source");
    fs::create_dir_all(outside.join("engine")).unwrap();
    symlink(&outside, fixture.root.join("debug/resources")).unwrap();

    let error = build_support::prepare_resource_overwrite(&fixture.out_dir).unwrap_err();

    assert_eq!(error.kind(), std::io::ErrorKind::InvalidInput);
}

#[test]
fn allows_first_build_without_generated_resources() {
    let fixture = Fixture::new();
    build_support::prepare_resource_overwrite(&fixture.out_dir).unwrap();
    assert!(!fixture.resources.exists());
}

#[test]
fn rejects_invalid_cargo_output_layout() {
    let fixture = Fixture::new();
    let error = build_support::prepare_resource_overwrite(&fixture.root).unwrap_err();
    assert_eq!(error.kind(), std::io::ErrorKind::InvalidInput);
}
