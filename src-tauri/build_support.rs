use std::{ffi::OsStr, fs, io, path::Path};

#[cfg(unix)]
use std::os::unix::fs::PermissionsExt;

pub fn prepare_resource_overwrite(out_dir: &Path) -> io::Result<()> {
    if out_dir.file_name() != Some(OsStr::new("out"))
        || out_dir.ancestors().nth(2).and_then(Path::file_name) != Some(OsStr::new("build"))
    {
        return Err(io::Error::new(
            io::ErrorKind::InvalidInput,
            format!("无效的 Cargo OUT_DIR: {}", out_dir.display()),
        ));
    }
    let target_dir = out_dir.ancestors().nth(3).ok_or_else(|| {
        io::Error::new(
            io::ErrorKind::InvalidInput,
            "无法从 OUT_DIR 确定 Cargo 输出目录",
        )
    })?;
    let resources = target_dir.join("resources/engine");
    let metadata = match fs::symlink_metadata(&resources) {
        Ok(metadata) => metadata,
        Err(error) if error.kind() == io::ErrorKind::NotFound => return Ok(()),
        Err(error) => return Err(error),
    };
    let canonical = resources.canonicalize()?;
    if metadata.is_symlink() || !canonical.starts_with(target_dir.canonicalize()?) {
        return Err(io::Error::new(
            io::ErrorKind::InvalidInput,
            format!(
                "拒绝修改 Cargo 输出目录以外的资源或符号链接: {}",
                resources.display()
            ),
        ));
    }
    prepare_directory(&canonical)
}

fn prepare_directory(directory: &Path) -> io::Result<()> {
    for entry in fs::read_dir(directory)? {
        let entry = entry?;
        let path = entry.path();
        let kind = entry.file_type()?;
        if kind.is_dir() {
            prepare_directory(&path)?;
        } else if kind.is_file() {
            let mut permissions = entry.metadata()?.permissions();
            #[cfg(unix)]
            let needs_write = permissions.mode() & 0o200 == 0;
            #[cfg(not(unix))]
            let needs_write = permissions.readonly();
            if needs_write {
                #[cfg(unix)]
                permissions.set_mode(permissions.mode() | 0o200);
                #[cfg(not(unix))]
                permissions.set_readonly(false);
                fs::set_permissions(&path, permissions).map_err(|error| {
                    io::Error::new(
                        error.kind(),
                        format!("无法为生成资源增加写权限 {}: {error}", path.display()),
                    )
                })?;
            }
        }
    }
    Ok(())
}
