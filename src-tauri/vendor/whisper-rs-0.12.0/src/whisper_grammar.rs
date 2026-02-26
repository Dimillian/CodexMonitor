use whisper_rs_sys::{
    whisper_gretype_WHISPER_GRETYPE_ALT, whisper_gretype_WHISPER_GRETYPE_CHAR,
    whisper_gretype_WHISPER_GRETYPE_CHAR_ALT, whisper_gretype_WHISPER_GRETYPE_CHAR_NOT,
    whisper_gretype_WHISPER_GRETYPE_CHAR_RNG_UPPER, whisper_gretype_WHISPER_GRETYPE_END,
    whisper_gretype_WHISPER_GRETYPE_RULE_REF,
};

#[cfg(any(not(windows), target_env = "gnu"))]
const GRETYPE_END: u32 = whisper_gretype_WHISPER_GRETYPE_END;
#[cfg(all(windows, not(target_env = "gnu")))]
const GRETYPE_END: i32 = whisper_gretype_WHISPER_GRETYPE_END as i32;

#[cfg(any(not(windows), target_env = "gnu"))]
const GRETYPE_ALT: u32 = whisper_gretype_WHISPER_GRETYPE_ALT;
#[cfg(all(windows, not(target_env = "gnu")))]
const GRETYPE_ALT: i32 = whisper_gretype_WHISPER_GRETYPE_ALT as i32;

#[cfg(any(not(windows), target_env = "gnu"))]
const GRETYPE_RULE_REF: u32 = whisper_gretype_WHISPER_GRETYPE_RULE_REF;
#[cfg(all(windows, not(target_env = "gnu")))]
const GRETYPE_RULE_REF: i32 = whisper_gretype_WHISPER_GRETYPE_RULE_REF as i32;

#[cfg(any(not(windows), target_env = "gnu"))]
const GRETYPE_CHAR: u32 = whisper_gretype_WHISPER_GRETYPE_CHAR;
#[cfg(all(windows, not(target_env = "gnu")))]
const GRETYPE_CHAR: i32 = whisper_gretype_WHISPER_GRETYPE_CHAR as i32;

#[cfg(any(not(windows), target_env = "gnu"))]
const GRETYPE_CHAR_NOT: u32 = whisper_gretype_WHISPER_GRETYPE_CHAR_NOT;
#[cfg(all(windows, not(target_env = "gnu")))]
const GRETYPE_CHAR_NOT: i32 = whisper_gretype_WHISPER_GRETYPE_CHAR_NOT as i32;

#[cfg(any(not(windows), target_env = "gnu"))]
const GRETYPE_CHAR_RNG_UPPER: u32 = whisper_gretype_WHISPER_GRETYPE_CHAR_RNG_UPPER;
#[cfg(all(windows, not(target_env = "gnu")))]
const GRETYPE_CHAR_RNG_UPPER: i32 = whisper_gretype_WHISPER_GRETYPE_CHAR_RNG_UPPER as i32;

#[cfg(any(not(windows), target_env = "gnu"))]
const GRETYPE_CHAR_ALT: u32 = whisper_gretype_WHISPER_GRETYPE_CHAR_ALT;
#[cfg(all(windows, not(target_env = "gnu")))]
const GRETYPE_CHAR_ALT: i32 = whisper_gretype_WHISPER_GRETYPE_CHAR_ALT as i32;

#[cfg_attr(any(not(windows), target_env = "gnu"), repr(u32))] // include windows-gnu
#[cfg_attr(all(windows, not(target_env = "gnu")), repr(i32))] // msvc being *special* again
#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub enum WhisperGrammarElementType {
    /// End of rule definition
    End = GRETYPE_END,
    /// Start of alternate definition for a rule
    Alternate = GRETYPE_ALT,
    /// Non-terminal element: reference to another rule
    RuleReference = GRETYPE_RULE_REF,
    /// Terminal element: character (code point)
    Character = GRETYPE_CHAR,
    /// Inverse of a character(s)
    NotCharacter = GRETYPE_CHAR_NOT,
    /// Modifies a preceding [Self::Character] to be an inclusive range
    CharacterRangeUpper = GRETYPE_CHAR_RNG_UPPER,
    /// Modifies a preceding [Self::Character] to add an alternate character to match
    CharacterAlternate = GRETYPE_CHAR_ALT,
}

impl From<whisper_rs_sys::whisper_gretype> for WhisperGrammarElementType {
    fn from(value: whisper_rs_sys::whisper_gretype) -> Self {
        assert!(
            (0..=6).contains(&value),
            "Invalid WhisperGrammarElementType value: {}",
            value
        );

        #[allow(non_upper_case_globals)] // weird place to trigger this
        match value {
            whisper_gretype_WHISPER_GRETYPE_END => WhisperGrammarElementType::End,
            whisper_gretype_WHISPER_GRETYPE_ALT => WhisperGrammarElementType::Alternate,
            whisper_gretype_WHISPER_GRETYPE_RULE_REF => WhisperGrammarElementType::RuleReference,
            whisper_gretype_WHISPER_GRETYPE_CHAR => WhisperGrammarElementType::Character,
            whisper_gretype_WHISPER_GRETYPE_CHAR_NOT => WhisperGrammarElementType::NotCharacter,
            whisper_gretype_WHISPER_GRETYPE_CHAR_RNG_UPPER => {
                WhisperGrammarElementType::CharacterRangeUpper
            }
            whisper_gretype_WHISPER_GRETYPE_CHAR_ALT => {
                WhisperGrammarElementType::CharacterAlternate
            }
            _ => unreachable!(),
        }
    }
}

impl From<WhisperGrammarElementType> for whisper_rs_sys::whisper_gretype {
    fn from(value: WhisperGrammarElementType) -> Self {
        value as Self
    }
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub struct WhisperGrammarElement {
    pub element_type: WhisperGrammarElementType,
    pub value: u32,
}

impl WhisperGrammarElement {
    pub fn new(element_type: WhisperGrammarElementType, value: u32) -> Self {
        Self {
            element_type,
            value,
        }
    }

    pub fn to_c_type(self) -> whisper_rs_sys::whisper_grammar_element {
        whisper_rs_sys::whisper_grammar_element {
            type_: self.element_type.into(),
            value: self.value,
        }
    }
}
