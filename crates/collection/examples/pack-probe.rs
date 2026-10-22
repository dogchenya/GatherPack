use easy_pack_collection::{build_plan, pack, Format};
use std::{path::Path, sync::atomic::AtomicBool};

fn main() {
    let args: Vec<_> = std::env::args().collect();
    if args.len() < 4 {
        eprintln!("pack-probe SOURCE OUTPUT zip|7z|tar.gz [--skip-issues]");
        std::process::exit(2);
    }
    let format = match args[3].as_str() {
        "zip" => Format::Zip,
        "7z" => Format::SevenZip,
        "tar.gz" => Format::TarGz,
        _ => {
            eprintln!("unsupported format");
            std::process::exit(2);
        }
    };
    let plan = build_plan(vec![args[1].clone()]);
    if plan.issues.iter().any(|i| i.blocking) && !args.iter().any(|a| a == "--skip-issues") {
        println!(
            "{}",
            serde_json::json!({"plan": plan, "error": "unacknowledged issues"})
        );
        std::process::exit(2);
    }
    let report = pack(
        &plan,
        Path::new(&args[2]),
        format,
        &AtomicBool::new(false),
        |_| {},
    );
    println!("{}", serde_json::json!({"plan": plan, "report": report}));
    std::process::exit(if report.delivered { 0 } else { 1 });
}
