import { BD_MOBILE_DIGITS, bdMobileDigits } from './Form.jsx';

describe('Bangladeshi mobile helpers', () => {
  it('reduces any common way of writing the number to the 10 digits after +880', () => {
    expect(bdMobileDigits('+8801712345678')).toBe('1712345678');
    expect(bdMobileDigits('8801712345678')).toBe('1712345678');
    expect(bdMobileDigits('01712345678')).toBe('1712345678');
    expect(bdMobileDigits('+880 1712-345678')).toBe('1712345678');
    expect(bdMobileDigits('1712abc345678999')).toBe('1712345678');
    expect(bdMobileDigits('')).toBe('');
  });

  it('accepts only operator prefixes 13–19 with exactly 10 digits', () => {
    expect(BD_MOBILE_DIGITS.test('1712345678')).toBe(true);
    expect(BD_MOBILE_DIGITS.test('1312345678')).toBe(true);
    expect(BD_MOBILE_DIGITS.test('1212345678')).toBe(false);
    expect(BD_MOBILE_DIGITS.test('171234567')).toBe(false);
    expect(BD_MOBILE_DIGITS.test('2712345678')).toBe(false);
  });
});
