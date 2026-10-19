pub fn count_lines(path: &str) -> std::io::Result<usize> {
    Ok(std::fs::read_to_string(path)?.lines().count())
}
