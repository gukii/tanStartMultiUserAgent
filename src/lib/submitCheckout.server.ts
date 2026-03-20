/**
 * submitCheckout.server.ts
 *
 * TanStack Start Server Function – Checkout form submission with validation.
 *
 * Validates form data on the server side and returns errors for invalid fields.
 * This simulates real-world server-side validation (business logic, database checks, etc.)
 * that can't be caught by client-side HTML5 validation alone.
 */

import { createServerFn } from '@tanstack/react-start'

export interface CheckoutFormData {
  firstName: string
  lastName: string
  email: string
  cardNumber: string
  expiry: string
  cvv: string
  address: string
  city: string
  country: string
  notes?: string
}

export interface ValidationError {
  field: string
  message: string
}

export interface SubmitCheckoutResult {
  success: boolean
  errors?: ValidationError[]
  orderId?: string
}

/**
 * Validate CVV (must be 3 or 4 digits)
 */
function validateCVV(cvv: string): string | null {
  const trimmed = cvv.trim()
  if (!/^\d{3,4}$/.test(trimmed)) {
    return 'CVV must be exactly 3 or 4 digits'
  }
  return null
}

/**
 * Validate card number using Luhn algorithm
 */
function validateCardNumber(cardNumber: string): string | null {
  // Remove spaces and non-digits
  const digits = cardNumber.replace(/\s/g, '').replace(/\D/g, '')

  if (digits.length < 13 || digits.length > 19) {
    return 'Card number must be between 13 and 19 digits'
  }

  // Luhn algorithm
  let sum = 0
  let isEven = false

  for (let i = digits.length - 1; i >= 0; i--) {
    let digit = parseInt(digits[i], 10)

    if (isEven) {
      digit *= 2
      if (digit > 9) {
        digit -= 9
      }
    }

    sum += digit
    isEven = !isEven
  }

  if (sum % 10 !== 0) {
    return 'Invalid card number (failed Luhn check)'
  }

  return null
}

/**
 * Validate expiry date (must be future date in MM/YY format)
 */
function validateExpiry(expiry: string): string | null {
  const match = expiry.match(/^(\d{2})\/(\d{2})$/)
  if (!match) {
    return 'Expiry must be in MM/YY format'
  }

  const month = parseInt(match[1], 10)
  const year = parseInt(match[2], 10)

  if (month < 1 || month > 12) {
    return 'Month must be between 01 and 12'
  }

  // Check if date is in the future
  const now = new Date()
  const currentYear = now.getFullYear() % 100 // Get last 2 digits
  const currentMonth = now.getMonth() + 1

  if (year < currentYear || (year === currentYear && month < currentMonth)) {
    return 'Card has expired'
  }

  return null
}

/**
 * Validate email format
 */
function validateEmail(email: string): string | null {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  if (!emailRegex.test(email)) {
    return 'Invalid email format'
  }

  // Simulate checking if email is already registered
  const blockedEmails = ['test@blocked.com', 'spam@example.com']
  if (blockedEmails.includes(email.toLowerCase())) {
    return 'This email address is not allowed'
  }

  return null
}

/**
 * Validate country code
 */
function validateCountry(country: string): string | null {
  const validCountries = ['US', 'DE', 'GB', 'FR', 'AU']
  if (!validCountries.includes(country)) {
    return 'Please select a valid country'
  }
  return null
}

/**
 * Server function to submit checkout form
 */
export const submitCheckout = createServerFn({ method: 'POST' })
  .inputValidator((data: unknown): CheckoutFormData => {
    if (typeof data !== 'object' || data === null) {
      throw new Error('Invalid form data')
    }

    const formData = data as Record<string, unknown>

    // Basic type checking
    if (typeof formData.firstName !== 'string' ||
        typeof formData.lastName !== 'string' ||
        typeof formData.email !== 'string' ||
        typeof formData.cardNumber !== 'string' ||
        typeof formData.expiry !== 'string' ||
        typeof formData.cvv !== 'string' ||
        typeof formData.address !== 'string' ||
        typeof formData.city !== 'string' ||
        typeof formData.country !== 'string') {
      throw new Error('Missing required fields')
    }

    return {
      firstName: formData.firstName,
      lastName: formData.lastName,
      email: formData.email,
      cardNumber: formData.cardNumber,
      expiry: formData.expiry,
      cvv: formData.cvv,
      address: formData.address,
      city: formData.city,
      country: formData.country,
      notes: typeof formData.notes === 'string' ? formData.notes : undefined,
    }
  })
  .handler(async (ctx): Promise<SubmitCheckoutResult> => {
    const formData = ctx.data
    const errors: ValidationError[] = []

    // Validate CVV
    const cvvError = validateCVV(formData.cvv)
    if (cvvError) {
      errors.push({ field: 'cvv', message: cvvError })
    }

    // Validate card number
    const cardError = validateCardNumber(formData.cardNumber)
    if (cardError) {
      errors.push({ field: 'cardNumber', message: cardError })
    }

    // Validate expiry
    const expiryError = validateExpiry(formData.expiry)
    if (expiryError) {
      errors.push({ field: 'expiry', message: expiryError })
    }

    // Validate email
    const emailError = validateEmail(formData.email)
    if (emailError) {
      errors.push({ field: 'email', message: emailError })
    }

    // Validate country
    const countryError = validateCountry(formData.country)
    if (countryError) {
      errors.push({ field: 'country', message: countryError })
    }

    // If there are errors, return them
    if (errors.length > 0) {
      return {
        success: false,
        errors,
      }
    }

    // Success - generate order ID
    const orderId = `ORD-${Date.now()}-${Math.random().toString(36).substring(2, 9).toUpperCase()}`

    console.log('[submitCheckout] Order placed successfully:', {
      orderId,
      customer: `${formData.firstName} ${formData.lastName}`,
      email: formData.email,
    })

    return {
      success: true,
      orderId,
    }
  })
