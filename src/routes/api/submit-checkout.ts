/**
 * API Route: /api/submit-checkout
 *
 * Handles checkout form submission with server-side validation.
 * Uses TanStack Start's server.handlers pattern for API endpoints.
 */

import { createFileRoute } from '@tanstack/react-router'

// Helper to create JSON responses
function json(data: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...init?.headers,
    },
  })
}

interface ValidationError {
  field: string
  message: string
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

export const Route = createFileRoute('/api/submit-checkout')({
  server: {
    handlers: {
      // GET handler - returns info about the endpoint
      GET: async () => {
        console.log('[API Route] GET /api/submit-checkout called')
        return json({
          message: 'POST to this endpoint to submit checkout form',
          accepts: 'application/x-www-form-urlencoded or multipart/form-data',
        })
      },

      // POST handler - processes form submission
      POST: async ({ request }) => {
        console.log('[API Route] POST /api/submit-checkout called')

        try {
          // Parse the incoming FormData
          const formData = await request.formData()
          console.log('[API Route] FormData parsed successfully')

          const data = {
            firstName: formData.get('firstName') as string,
            lastName: formData.get('lastName') as string,
            email: formData.get('email') as string,
            cardNumber: formData.get('cardNumber') as string,
            expiry: formData.get('expiry') as string,
            cvv: formData.get('cvv') as string,
            address: formData.get('address') as string,
            city: formData.get('city') as string,
            country: formData.get('country') as string,
            notes: (formData.get('notes') as string) || undefined,
          }

          console.log('[API] Received form data:', { ...data, cvv: '***', cardNumber: '****' })

          // Server-side validation
          const errors: ValidationError[] = []

          // Validate CVV
          const cvvError = validateCVV(data.cvv)
          if (cvvError) {
            errors.push({ field: 'cvv', message: cvvError })
          }

          // Validate card number
          const cardError = validateCardNumber(data.cardNumber)
          if (cardError) {
            errors.push({ field: 'cardNumber', message: cardError })
          }

          // Validate expiry
          const expiryError = validateExpiry(data.expiry)
          if (expiryError) {
            errors.push({ field: 'expiry', message: expiryError })
          }

          // Validate email
          const emailError = validateEmail(data.email)
          if (emailError) {
            errors.push({ field: 'email', message: emailError })
          }

          // Validate country
          const countryError = validateCountry(data.country)
          if (countryError) {
            errors.push({ field: 'country', message: countryError })
          }

          // If there are errors, return them
          if (errors.length > 0) {
            console.log('[API] Validation failed:', errors)
            return json({ success: false, errors }, { status: 400 })
          }

          // Success - generate order ID
          const orderId = `ORD-${Date.now()}-${Math.random().toString(36).substring(2, 9).toUpperCase()}`
          console.log('[API] Order placed successfully:', {
            orderId,
            customer: `${data.firstName} ${data.lastName}`,
            email: data.email,
          })

          return json({ success: true, orderId })
        } catch (error) {
          console.error('[API] Error processing form:', error)
          return json(
            {
              success: false,
              errors: [{ field: '_form', message: 'Server error occurred' }],
            },
            { status: 500 }
          )
        }
      },
    },
  },
})
