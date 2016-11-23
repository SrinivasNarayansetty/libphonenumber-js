// This is a port of Google Android `libphonenumber`'s
// `phonenumberutil.js` of 17th November, 2016.
//
// https://github.com/googlei18n/libphonenumber/commits/master/javascript/i18n/phonenumbers/phonenumberutil.js

import metadata from '../metadata.min'

import
{
	get_phone_code,
	get_national_number_pattern,
	get_formats,
	get_national_prefix,
	get_national_prefix_formatting_rule,
	get_national_prefix_for_parsing,
	get_national_prefix_transform_rule,
	get_national_prefix_is_optional_when_formatting,
	get_leading_digits,
	get_format_pattern,
	get_format_format,
	get_format_leading_digits,
	get_format_national_prefix_formatting_rule,
	get_format_national_prefix_optional_when_formatting,
	get_format_international_format
}
from './metadata'

const default_options =
{
	country: {}
}

// `options`:
//  {
//    country:
//    {
//      restrict - (a two-letter country code)
//                 the phone number must be in this country
//
//      default - (a two-letter country code)
//                default country to use for phone number parsing and validation
//                (if no country code could be derived from the phone number)
//    }
//  }
//
// Returns `{ country, number }`
export default function parse(text, options)
{
	if (typeof options === 'string')
	{
		const restrict_to_country = options

		options =
		{
			...default_options,

			country:
			{
				restrict: restrict_to_country
			}
		}
	}

	if (!options)
	{
		options = { ...default_options }
	}

	// Parse the phone number

	if (!text || text.length > MAX_INPUT_STRING_LENGTH)
	{
		return {}
	}

	text = extract_possible_number(text)

	let { country_phone_code, number } = extract_country_phone_code(text)

	// Maybe invalid country phone code encountered
	if (!country_phone_code && !number)
	{
		return {}
	}

	let country
	let country_metadata

	if (country_phone_code)
	{
		// Check country restriction
		if (options.country.restrict &&
			country_phone_code !== get_phone_code(metadata.countries[options.country.restrict]))
		{
			return {}
		}

		country_metadata = get_metadata_by_country_phone_code(country_phone_code)
	}
	else if (options.country.default || options.country.restrict)
	{
		country = options.country.default || options.country.restrict
		country_metadata = metadata.countries[country]
		number = normalize(text)
	}

	if (!country_metadata)
	{
		return {}
	}

	// Sanity check
	if (number.length < MIN_LENGTH_FOR_NSN)
	{
		return {}
	}

	const national_number = strip_national_prefix(number, country_metadata)

	if (!country)
	{
		country = find_country_code(country_phone_code, national_number)

		// Check country restriction
		if (options.country.restrict && country !== options.country.restrict)
		{
			return {}
		}
	}

	// They say that sometimes national (significant) numbers
	// can be longer than `MAX_LENGTH_FOR_NSN` (e.g. in Germany).
	// https://github.com/googlei18n/libphonenumber/blob/7e1748645552da39c4e1ba731e47969d97bdb539/resources/phonenumber.proto#L36
	if (national_number.length < MIN_LENGTH_FOR_NSN
		|| national_number.length > MAX_LENGTH_FOR_NSN)
	{
		return { phone: number }
	}

	const national_number_rule = new RegExp(get_national_number_pattern(country_metadata))

	if (!matches_entirely(national_number_rule, national_number))
	{
		return {}
	}

	return { country, phone: national_number }
}

const PLUS_CHARS = '+\uFF0B'

// Digits accepted in phone numbers
// (ascii, fullwidth, arabic-indic, and eastern arabic digits).
const VALID_DIGITS = '0-9\uFF10-\uFF19\u0660-\u0669\u06F0-\u06F9'

// This consists of the plus symbol, digits, and arabic-indic digits.
const PHONE_NUMBER_START_PATTERN = new RegExp('[' + PLUS_CHARS + VALID_DIGITS + ']')

// Regular expression of trailing characters that we want to remove. We remove
// all characters that are not alpha or numerical characters. The hash character
// is retained here, as it may signify the previous block was an extension.
const AFTER_PHONE_NUMBER_END_PATTERN = new RegExp('[^' + VALID_DIGITS + ']+$')

const LEADING_PLUS_CHARS_PATTERN = new RegExp('^[' + PLUS_CHARS + ']+')

// These mappings map a character (key) to a specific digit that should
// replace it for normalization purposes. Non-European digits that
// may be used in phone numbers are mapped to a European equivalent.
const DIGIT_MAPPINGS =
{
	'0': '0',
	'1': '1',
	'2': '2',
	'3': '3',
	'4': '4',
	'5': '5',
	'6': '6',
	'7': '7',
	'8': '8',
	'9': '9',
	'\uFF10': '0', // Fullwidth digit 0
	'\uFF11': '1', // Fullwidth digit 1
	'\uFF12': '2', // Fullwidth digit 2
	'\uFF13': '3', // Fullwidth digit 3
	'\uFF14': '4', // Fullwidth digit 4
	'\uFF15': '5', // Fullwidth digit 5
	'\uFF16': '6', // Fullwidth digit 6
	'\uFF17': '7', // Fullwidth digit 7
	'\uFF18': '8', // Fullwidth digit 8
	'\uFF19': '9', // Fullwidth digit 9
	'\u0660': '0', // Arabic-indic digit 0
	'\u0661': '1', // Arabic-indic digit 1
	'\u0662': '2', // Arabic-indic digit 2
	'\u0663': '3', // Arabic-indic digit 3
	'\u0664': '4', // Arabic-indic digit 4
	'\u0665': '5', // Arabic-indic digit 5
	'\u0666': '6', // Arabic-indic digit 6
	'\u0667': '7', // Arabic-indic digit 7
	'\u0668': '8', // Arabic-indic digit 8
	'\u0669': '9', // Arabic-indic digit 9
	'\u06F0': '0', // Eastern-Arabic digit 0
	'\u06F1': '1', // Eastern-Arabic digit 1
	'\u06F2': '2', // Eastern-Arabic digit 2
	'\u06F3': '3', // Eastern-Arabic digit 3
	'\u06F4': '4', // Eastern-Arabic digit 4
	'\u06F5': '5', // Eastern-Arabic digit 5
	'\u06F6': '6', // Eastern-Arabic digit 6
	'\u06F7': '7', // Eastern-Arabic digit 7
	'\u06F8': '8', // Eastern-Arabic digit 8
	'\u06F9': '9'  // Eastern-Arabic digit 9
}

// The maximum length of the country calling code.
const MAX_LENGTH_COUNTRY_CODE = 3

// The minimum length of the national significant number.
const MIN_LENGTH_FOR_NSN = 2

// The ITU says the maximum length should be 15,
// but one can find longer numbers in Germany.
const MAX_LENGTH_FOR_NSN = 17

// We don't allow input strings for parsing to be longer than 250 chars.
// This prevents malicious input from consuming CPU.
const MAX_INPUT_STRING_LENGTH = 250

// Normalizes a string of characters representing a phone number.
// This converts wide-ascii and arabic-indic numerals to European numerals,
// and strips punctuation and alpha characters.
export function normalize(number)
{
	return replace_characters(number, DIGIT_MAPPINGS)
}

// For any character not being part of `replacements`
// it is removed from the phone number.
export function replace_characters(text, replacements)
{
	let replaced = ''

	for (let character of text)
	{
		const replacement = replacements[character.toUpperCase()]

		if (replacement !== undefined)
		{
			replaced += replacement
		}
	}

	return replaced
}

// Checks whether the entire input sequence can be matched
// against the regular expression.
export function matches_entirely(regular_expression, text)
{
	if (typeof regular_expression === 'string')
	{
		regular_expression = '^(?:' + regular_expression + ')$'
	}

	const matched_groups = text.match(regular_expression)
	return matched_groups && matched_groups[0].length === text.length
}

// Attempts to extract a possible number from the string passed in.
export function extract_possible_number(text)
{
	const starts_at = text.search(PHONE_NUMBER_START_PATTERN)

	if (starts_at < 0)
	{
		return ''
	}

	return text
		// Trim everything to the left of the phone number
		.slice(starts_at)
		// Remove trailing non-numerical characters
		.replace(AFTER_PHONE_NUMBER_END_PATTERN, '')
}

// Tries to extract a country calling code from a number
export function extract_country_phone_code(number)
{
	if (!number)
	{
		return {}
	}

	// If this is not an international phone number,
	// then don't extract country phone code.
	if (!LEADING_PLUS_CHARS_PATTERN.test(number))
	{
		return { number }
	}

	// Strip the leading '+' and remove non-digits
	number = normalize(number.replace(LEADING_PLUS_CHARS_PATTERN, ''))

	if (!number)
	{
		return {}
	}

	// Country codes do not begin with a '0'
	if (number[0] === '0')
	{
		return {}
	}

	// The thing with country phone codes
	// is that they are orthogonal to each other
	// i.e. there's no such country phone code A
	// for which country phone code B exists
	// where B starts with A.
	// Therefore, while scanning digits,
	// if a valid country code is found,
	// that means that it is the country code.
	//
	let i = 1
	while (i <= MAX_LENGTH_COUNTRY_CODE && i <= number.length)
	{
		const country_phone_code = number.slice(0, i)

		if (metadata.country_phone_code_to_countries[country_phone_code])
		{
			return { country_phone_code, number: number.slice(i) }
		}

		i++
	}

	return {}
}

// Formatting information for regions which share
// a country calling code is contained by only one region
// for performance reasons. For example, for NANPA region
// ("North American Numbering Plan Administration",
//  which includes USA, Canada, Cayman Islands, Bahamas, etc)
// it will be contained in the metadata for `US`.
export function get_metadata_by_country_phone_code(country_phone_code)
{
	const country_code = metadata.country_phone_code_to_countries[country_phone_code][0]
	return metadata.countries[country_code]
}

// Strips any national prefix (such as 0, 1) present in the number provided
export function strip_national_prefix(number, country_metadata)
{
	const national_prefix_for_parsing = get_national_prefix_for_parsing(country_metadata)

	if (!number || !national_prefix_for_parsing)
	{
		return number
	}

	// Attempt to parse the first digits as a national prefix
	const national_prefix_pattern = new RegExp('^(?:' + national_prefix_for_parsing + ')')
	const national_prefix_matcher = national_prefix_pattern.exec(number)

	if (!national_prefix_matcher)
	{
		return number
	}

	const national_prefix_transform_rule = get_national_prefix_transform_rule(country_metadata)

	let national_significant_number

	// `!national_prefix_matcher[national_prefix_matcher.length - 1]`
	// implies nothing was captured by the capturing groups
	// in `national_prefix_for_parsing`.
	// Therefore, no transformation is necessary,
	// and we just remove the national prefix.
	if (!national_prefix_transform_rule || !national_prefix_matcher[national_prefix_matcher.length - 1])
	{
		national_significant_number = number.slice(national_prefix_matcher[0].length)
	}
	else
	{
		national_significant_number = number.replace(national_prefix_pattern, national_prefix_transform_rule)
	}

	const national_number_rule = new RegExp(get_national_number_pattern(country_metadata))

	// If the original number was viable, and the resultant number is not, then return.
	if (matches_entirely(national_number_rule, number) &&
			!matches_entirely(national_number_rule, national_significant_number))
	{
		return number
	}

   return national_significant_number
}

export function find_country_code(country_phone_code, national_phone_number)
{
	if (!country_phone_code)
	{
		return
	}

	const possible_country_codes = metadata.country_phone_code_to_countries[country_phone_code]

	if (!possible_country_codes)
	{
		return
	}

	for (let country_code of possible_country_codes)
	{
		const country = metadata.countries[country_code]

		if (get_leading_digits(country))
		{
			if (national_phone_number &&
				national_phone_number.search(get_leading_digits(country)) === 0)
			{
				return country_code
			}
		}
		else if (is_national_phone_number(national_phone_number, country))
		{
			return country_code
		}
	}
}

export function is_national_phone_number(national_number, country_metadata)
{
	if (!national_number)
	{
		return false
	}

	// Faster false positives
	// const possible_lengths = [...]
	// if (possible_lengths && possible_lengths.length > 0 &&
	// 	possible_lengths.indexOf(national_number.length) < 0)
	// {
	// 	return false
	// }

	return matches_entirely(get_national_number_pattern(country_metadata), national_number)
}