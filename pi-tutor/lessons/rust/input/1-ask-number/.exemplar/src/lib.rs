pub fn ask_number<R: std::io::BufRead>(input: &mut R) -> i64 {
    loop {
        let mut line = String::new();
        if input.read_line(&mut line).unwrap_or(0) == 0 {
            return 0;
        }
        if let Ok(n) = line.trim().parse() {
            return n;
        }
    }
}
