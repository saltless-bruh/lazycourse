use exam::ask_number;
use std::io::Cursor;

#[test]
fn first_try() {
    assert_eq!(ask_number(&mut Cursor::new("7\n")), 7);
}

#[test]
fn keeps_asking() {
    assert_eq!(ask_number(&mut Cursor::new("seven\n\n12\n")), 12);
}
