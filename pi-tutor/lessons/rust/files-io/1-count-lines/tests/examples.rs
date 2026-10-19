use exam::count_lines;
use std::fs;

fn file(name: &str, text: &str) -> String {
    let dir = std::env::temp_dir().join(format!("cl-{}-{}", std::process::id(), name));
    fs::create_dir_all(&dir).unwrap();
    let p = dir.join("f.txt");
    fs::write(&p, text).unwrap();
    p.to_string_lossy().into_owned()
}

#[test]
fn three_lines() {
    assert_eq!(count_lines(&file("three", "a\nb\nc\n")).unwrap(), 3);
}

#[test]
fn missing_file_is_an_error() {
    assert!(count_lines("/nonexistent/lazycourse/f.txt").is_err());
}
