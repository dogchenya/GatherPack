"""Refresh installed runtime libraries whose exact Ubuntu source index entry expired.

Run after enabling deb-src and apt-get update, before compiling or bundling.
The default is read-only; --apply upgrades installed library packages only.
"""
import argparse
import json
import os
import re
import subprocess


def installed_libraries():
    output = subprocess.check_output([
        "dpkg-query", "-W", "-f=${binary:Package}\t${Section}\t${db:Status-Status}\t${source:Package}\t${source:Version}\n"
    ], text=True)
    result = []
    for line in output.splitlines():
        fields = line.split("\t")
        if len(fields) == 5:
            package, section, status, source, version = fields
            if status == "installed" and section.rsplit("/", 1)[-1] in ("libs", "oldlibs"):
                result.append((package, source, version))
    return result


def indexed_versions(sources):
    process = subprocess.run(["apt-cache", "showsrc", "--only-source", *sorted(set(sources))], capture_output=True, text=True)
    versions = {}
    for paragraph in process.stdout.split("\n\n"):
        fields = dict(line.split(": ", 1) for line in paragraph.splitlines() if line.startswith(("Package: ", "Version: ")))
        if "Package" in fields and "Version" in fields:
            versions.setdefault(fields["Package"], set()).add(fields["Version"])
    if not versions:
        raise RuntimeError("No matching source indexes; enable deb-src and run apt-get update first")
    return versions


def expired_libraries(libraries, indexed):
    result = []
    for package, source, installed in libraries:
        available = indexed.get(source, set())
        if installed in available:
            continue
        # Do not downgrade newer third-party/PPA packages to an Ubuntu version.
        # The final AppImage gate still checks every actually bundled library.
        if any(subprocess.run(["dpkg", "--compare-versions", installed, "lt", version]).returncode == 0 for version in available):
            result.append(package)
    return sorted(set(result))


def has_upgrade_candidate(package):
    policy = subprocess.check_output(["apt-cache", "policy", package], text=True, env={**os.environ, "LC_ALL": "C"})
    installed = re.search(r"^\s*Installed:\s*(\S+)", policy, re.MULTILINE)
    candidate = re.search(r"^\s*Candidate:\s*(\S+)", policy, re.MULTILINE)
    if not installed or not candidate or "(none)" in (installed.group(1), candidate.group(1)):
        return False
    return subprocess.run(["dpkg", "--compare-versions", installed.group(1), "lt", candidate.group(1)]).returncode == 0


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args()
    libraries = installed_libraries()
    indexed = indexed_versions(source for _, source, _ in libraries)
    outdated = expired_libraries(libraries, indexed)
    expired = [package for package in outdated if has_upgrade_candidate(package)]
    # Older compatibility ABIs (e.g. libicu70 on Ubuntu 24.04) cannot upgrade to
    # a differently named package. Leave them intact; the final bundle gate
    # validates the source of every library actually selected for delivery.
    skipped = sorted(set(outdated) - set(expired))
    print(json.dumps({"expiredInstalledLibraries": expired, "unchangedCompatibilityLibraries": skipped, "apply": args.apply}), flush=True)
    if args.apply and expired:
        subprocess.run(["apt-get", "install", "-y", "--only-upgrade", "--no-remove", "--no-install-recommends", *expired], check=True, env={**os.environ, "DEBIAN_FRONTEND": "noninteractive"})
        remaining = [package for package in expired_libraries(installed_libraries(), indexed) if has_upgrade_candidate(package)]
        if remaining:
            raise RuntimeError("Installed library sources remain unavailable after refresh: " + ", ".join(remaining))


if __name__ == "__main__":
    main()
