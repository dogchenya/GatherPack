use easy_pack_collection::*;
use std::{
    fs,
    io::Read,
    sync::atomic::{AtomicBool, Ordering},
};
fn fixture() -> (tempfile::TempDir, Plan) {
    let dir = tempfile::tempdir().unwrap();
    let root = dir.path().join("source");
    fs::create_dir_all(root.join("empty")).unwrap();
    fs::create_dir_all(root.join(".git")).unwrap();
    fs::write(root.join(".git/config"), b"hidden").unwrap();
    fs::write(root.join("中文.txt"), b"hello source").unwrap();
    let plan = build_plan(vec![
        root.to_string_lossy().into_owned(),
        root.join("中文.txt").to_string_lossy().into_owned(),
    ]);
    (dir, plan)
}
#[test]
fn formats_roundtrip_structure_content_and_privacy() {
    for format in [Format::Zip, Format::SevenZip, Format::TarGz] {
        let (dir, plan) = fixture();
        let out = dir.path().join(format!("archive.{}", format.extension()));
        let report = pack(&plan, &out, format, &AtomicBool::new(false), |_| {});
        assert!(report.delivered, "{report:?}");
        assert_eq!(report.written.len(), 2);
        assert_eq!(report.empty_directories, 1);
        let extract = dir.path().join("extract");
        fs::create_dir(&extract).unwrap();
        match format {
            Format::Zip => {
                let mut zip = zip::ZipArchive::new(fs::File::open(&out).unwrap()).unwrap();
                zip.extract(&extract).unwrap();
            }
            Format::TarGz => {
                let gzip = flate2::read::GzDecoder::new(fs::File::open(&out).unwrap());
                tar::Archive::new(gzip).unpack(&extract).unwrap();
            }
            Format::SevenZip => {
                sevenz_rust::decompress_file(&out, &extract).unwrap();
            }
        }
        assert_eq!(
            fs::read(extract.join("source/中文.txt")).unwrap(),
            b"hello source"
        );
        assert_eq!(
            fs::read(extract.join("source/.git/config")).unwrap(),
            b"hidden"
        );
        assert!(extract.join("source/empty").is_dir());
        assert!(!extract.join("last-report.json").exists());
        assert_eq!(
            fs::read(dir.path().join("source/中文.txt")).unwrap(),
            b"hello source"
        );
    }
}
#[test]
fn collisions_overlap_restore_and_source_protection() {
    let (dir, mut plan) = fixture();
    let second = dir.path().join("other");
    fs::create_dir(&second).unwrap();
    fs::write(second.join("SOURCE"), b"second").unwrap();
    let mut sources = plan.sources.clone();
    sources.push(second.join("SOURCE").to_string_lossy().into_owned());
    plan = build_plan(sources.clone());
    assert_eq!(plan.files, 3);
    assert_eq!(plan.issues.len(), 1);
    assert!(plan.entries.iter().any(|e| e.destination == "SOURCE (2)"));
    assert!(validate_output(&plan, &dir.path().join("source/out.zip")).is_err());
    let mut collection = Collection::default();
    let report = collection.add(sources.iter().map(Into::into).collect());
    assert_eq!(report.added, 3);
    assert_eq!(
        collection.add(vec![dir.path().join("source")]).duplicates,
        1
    );
    let restored = Collection::restore(collection.paths());
    assert_eq!(restored.entries().len(), 3);
    collection.clear();
    assert!(dir.path().join("source/中文.txt").exists());
    fs::remove_file(second.join("SOURCE")).unwrap();
    assert_ne!(restored.entries()[2].status, "可用");
    assert!(build_plan(restored.paths())
        .issues
        .iter()
        .any(|i| i.blocking));
}
#[test]
fn cancellation_failure_and_no_clobber_leave_no_archive() {
    for format in [Format::Zip, Format::SevenZip, Format::TarGz] {
        let (dir, plan) = fixture();
        let out = dir.path().join(format!("out.{}", format.extension()));
        let cancel = AtomicBool::new(false);
        let r = pack(&plan, &out, format, &cancel, |_| {
            cancel.store(true, Ordering::Relaxed);
        });
        assert!(!r.delivered);
        assert_eq!(r.status, "cancelled");
        assert!(!out.exists());
        assert_eq!(
            fs::read_dir(dir.path()).unwrap().count(),
            1,
            "temporary output leaked"
        );
        fs::write(&out, b"existing").unwrap();
        let r = pack(&plan, &out, format, &AtomicBool::new(false), |_| {});
        assert!(!r.delivered);
        assert_eq!(fs::read(&out).unwrap(), b"existing");
        fs::remove_file(&out).unwrap();
        fs::remove_file(dir.path().join("source/中文.txt")).unwrap();
        let r = pack(&plan, &out, format, &AtomicBool::new(false), |_| {});
        assert!(!r.delivered);
        assert!(!r.failed.is_empty());
        assert!(!out.exists());
    }
}
#[test]
fn frozen_plan_survives_public_collection_changes() {
    let (dir, plan) = fixture();
    let mut collection = Collection::restore(plan.sources.clone());
    collection.clear();
    let out = dir.path().join("frozen.zip");
    assert!(pack(&plan, &out, Format::Zip, &AtomicBool::new(false), |_| {}).delivered);
    let mut zip = zip::ZipArchive::new(fs::File::open(out).unwrap()).unwrap();
    let mut text = String::new();
    zip.by_name("source/中文.txt")
        .unwrap()
        .read_to_string(&mut text)
        .unwrap();
    assert_eq!(text, "hello source");
    assert!(collection.entries().is_empty());
}
#[cfg(unix)]
#[test]
fn links_and_portable_names_are_checked() {
    let (dir, _) = fixture();
    let root = dir.path().join("source");
    std::os::unix::fs::symlink(dir.path(), root.join("loop")).unwrap();
    for name in ["CON.txt", "a?.txt", "a*.txt", "SAME", "same"] {
        fs::write(root.join(name), name).unwrap();
    }
    let p = build_plan(vec![root.to_string_lossy().into_owned()]);
    assert_eq!(p.issues.iter().filter(|i| i.blocking).count(), 1);
    assert!(p.renames.len() >= 4);
    assert!(!p.entries.iter().any(|e| e.destination.contains("loop")));
}
#[test]
#[ignore = "creates and streams a sparse file larger than 4 GiB"]
fn zip64_large_file_roundtrip() {
    let dir = tempfile::tempdir().unwrap();
    let source = dir.path().join("large.bin");
    fs::File::create(&source)
        .unwrap()
        .set_len(u32::MAX as u64 + 17)
        .unwrap();
    let plan = build_plan(vec![source.to_string_lossy().into_owned()]);
    let out = dir.path().join("large.zip");
    let mut bytes = 0;
    let r = pack(&plan, &out, Format::Zip, &AtomicBool::new(false), |n| {
        bytes += n
    });
    assert!(r.delivered, "{r:?}");
    assert_eq!(bytes, u32::MAX as u64 + 17);
    let mut zip = zip::ZipArchive::new(fs::File::open(out).unwrap()).unwrap();
    let mut file = zip.by_name("large.bin").unwrap();
    assert_eq!(file.size(), bytes);
    let mut read = 0;
    let mut buf = vec![1; 128 * 1024];
    loop {
        let n = file.read(&mut buf).unwrap();
        if n == 0 {
            break;
        }
        assert!(buf[..n].iter().all(|b| *b == 0));
        read += n as u64;
    }
    assert_eq!(read, bytes);
}
#[test]
#[ignore = "streams a file larger than 4 GiB through 7z and tar.gz"]
fn other_formats_large_file_roundtrip() {
    let dir = tempfile::tempdir().unwrap();
    let source = dir.path().join("large.bin");
    let expected = u32::MAX as u64 + 17;
    fs::File::create(&source)
        .unwrap()
        .set_len(expected)
        .unwrap();
    let plan = build_plan(vec![source.to_string_lossy().into_owned()]);
    fn verify(reader: &mut dyn Read, expected: u64) {
        let mut bytes = 0;
        let mut buffer = vec![1; 128 * 1024];
        loop {
            let n = reader.read(&mut buffer).unwrap();
            if n == 0 {
                break;
            }
            assert!(buffer[..n].iter().all(|b| *b == 0));
            bytes += n as u64;
        }
        assert_eq!(bytes, expected);
    }
    for format in [Format::TarGz, Format::SevenZip] {
        let out = dir.path().join(format!("large.{}", format.extension()));
        let r = pack(&plan, &out, format, &AtomicBool::new(false), |_| {});
        assert!(r.delivered, "{r:?}");
        match format {
            Format::TarGz => {
                let mut archive =
                    tar::Archive::new(flate2::read::GzDecoder::new(fs::File::open(out).unwrap()));
                let mut entries = archive.entries().unwrap();
                let mut file = entries.next().unwrap().unwrap();
                assert_eq!(file.size(), expected);
                verify(&mut file, expected);
                assert!(entries.next().is_none());
            }
            Format::SevenZip => {
                let mut archive =
                    sevenz_rust::SevenZReader::open(out, sevenz_rust::Password::empty()).unwrap();
                archive
                    .for_each_entries(|entry, reader| {
                        assert_eq!(entry.size, expected);
                        verify(reader, expected);
                        Ok(true)
                    })
                    .unwrap();
            }
            _ => unreachable!(),
        }
    }
}
#[test]
fn source_truncated_during_read_is_never_delivered() {
    for format in [Format::Zip, Format::SevenZip, Format::TarGz] {
        let dir = tempfile::tempdir().unwrap();
        let source = dir.path().join("mutable.bin");
        fs::write(&source, vec![7_u8; 2 * 1024 * 1024]).unwrap();
        let plan = build_plan(vec![source.to_string_lossy().into_owned()]);
        let out = dir.path().join(format!("out.{}", format.extension()));
        let mut changed = false;
        let r = pack(&plan, &out, format, &AtomicBool::new(false), |n| {
            if n > 0 && !changed {
                changed = true;
                fs::OpenOptions::new()
                    .write(true)
                    .open(&source)
                    .unwrap()
                    .set_len(0)
                    .unwrap();
            }
        });
        assert!(!r.delivered, "{format:?}");
        assert!(!out.exists());
        assert_eq!(r.failed.len(), 1);
    }
}
#[cfg(unix)]
#[test]
fn replaced_directory_link_is_not_followed_during_pack() {
    for format in [Format::Zip, Format::SevenZip, Format::TarGz] {
        let dir = tempfile::tempdir().unwrap();
        let tree = dir.path().join("tree");
        let outside = dir.path().join("outside");
        fs::create_dir(&tree).unwrap();
        fs::create_dir(&outside).unwrap();
        fs::write(tree.join("a.txt"), b"inside").unwrap();
        fs::write(tree.join("b.txt"), b"inside").unwrap();
        fs::write(outside.join("b.txt"), b"secret").unwrap();
        let plan = build_plan(vec![tree.to_string_lossy().into_owned()]);
        let mut replaced = false;
        let output = dir.path().join(format!("out.{}", format.extension()));
        let r = pack(&plan, &output, format, &AtomicBool::new(false), |n| {
            if n > 0 && !replaced {
                replaced = true;
                fs::rename(&tree, dir.path().join("old-tree")).unwrap();
                std::os::unix::fs::symlink(&outside, &tree).unwrap();
            }
        });
        assert!(!r.delivered);
        assert!(!output.exists());
        assert_eq!(fs::read(outside.join("b.txt")).unwrap(), b"secret");
    }
}
