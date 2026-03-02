/**
 * Example child route: _collab.order-form.tsx
 *
 * This route is automatically wrapped by the _collab layout.
 * No need to add CollaborationHarness - it's inherited from the parent layout.
 *
 * Access this route at: /order-form
 *
 * Features you get automatically:
 * - Real-time field sync
 * - Ghost cursors
 * - Field locking
 * - Floating cursor chat controls
 */

import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'

export const Route = createFileRoute('/_collab/order-form')({
  component: OrderFormPage,
})

function OrderFormPage() {
  const [submitted, setSubmitted] = useState(false)

  if (submitted) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-10">
        <div className="rounded-lg bg-green-50 border border-green-200 p-6 text-center">
          <div className="text-4xl mb-2">✅</div>
          <h2 className="text-xl font-bold text-green-900 mb-2">Order Submitted!</h2>
          <p className="text-green-700 mb-4">Your order has been received.</p>
          <button
            onClick={() => setSubmitted(false)}
            className="rounded-lg bg-green-600 px-4 py-2 text-white hover:bg-green-700 transition"
          >
            Submit Another Order
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <div className="mb-6">
        <a href="/" className="text-sm text-violet-600 hover:underline">← Back to Home</a>
        <h1 className="mt-2 text-2xl font-bold text-gray-900">Order Form</h1>
        <p className="mt-1 text-sm text-gray-500">
          Open this page in multiple tabs to see real-time collaboration.
        </p>
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white p-8 shadow-sm">
        <form
          onSubmit={(e) => {
            e.preventDefault()
            setSubmitted(true)
          }}
        >
          {/* Customer Information */}
          <fieldset className="mb-6">
            <legend className="text-lg font-semibold text-gray-900 mb-3">
              Customer Information
            </legend>

            <div className="space-y-3">
              <div>
                <label htmlFor="customerName" className="block text-sm font-medium text-gray-700 mb-1">
                  Customer Name
                </label>
                <input
                  id="customerName"
                  name="customerName"
                  type="text"
                  placeholder="John Doe"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-200"
                />
              </div>

              <div>
                <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
                  Email
                </label>
                <input
                  id="email"
                  name="email"
                  type="email"
                  placeholder="john@example.com"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-200"
                />
              </div>

              <div>
                <label htmlFor="phone" className="block text-sm font-medium text-gray-700 mb-1">
                  Phone
                </label>
                <input
                  id="phone"
                  name="phone"
                  type="tel"
                  placeholder="(555) 123-4567"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-200"
                />
              </div>
            </div>
          </fieldset>

          {/* Order Details */}
          <fieldset className="mb-6">
            <legend className="text-lg font-semibold text-gray-900 mb-3">
              Order Details
            </legend>

            <div className="space-y-3">
              <div>
                <label htmlFor="product" className="block text-sm font-medium text-gray-700 mb-1">
                  Product
                </label>
                <select
                  id="product"
                  name="product"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-200"
                >
                  <option value="">Select a product...</option>
                  <option value="widget-pro">Widget Pro</option>
                  <option value="gadget-max">Gadget Max</option>
                  <option value="device-ultra">Device Ultra</option>
                </select>
              </div>

              <div>
                <label htmlFor="quantity" className="block text-sm font-medium text-gray-700 mb-1">
                  Quantity
                </label>
                <input
                  id="quantity"
                  name="quantity"
                  type="number"
                  min="1"
                  defaultValue="1"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-200"
                />
              </div>

              <div>
                <label htmlFor="notes" className="block text-sm font-medium text-gray-700 mb-1">
                  Special Instructions
                </label>
                <textarea
                  id="notes"
                  name="notes"
                  rows={3}
                  placeholder="Any special requests or notes..."
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-200"
                />
              </div>
            </div>
          </fieldset>

          {/* Shipping Address */}
          <fieldset className="mb-6">
            <legend className="text-lg font-semibold text-gray-900 mb-3">
              Shipping Address
            </legend>

            <div className="space-y-3">
              <div>
                <label htmlFor="address" className="block text-sm font-medium text-gray-700 mb-1">
                  Street Address
                </label>
                <input
                  id="address"
                  name="address"
                  type="text"
                  placeholder="123 Main St"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-200"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="city" className="block text-sm font-medium text-gray-700 mb-1">
                    City
                  </label>
                  <input
                    id="city"
                    name="city"
                    type="text"
                    placeholder="San Francisco"
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-200"
                  />
                </div>

                <div>
                  <label htmlFor="zip" className="block text-sm font-medium text-gray-700 mb-1">
                    ZIP Code
                  </label>
                  <input
                    id="zip"
                    name="zip"
                    type="text"
                    placeholder="94102"
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-200"
                  />
                </div>
              </div>
            </div>
          </fieldset>

          {/* Submit */}
          <button
            type="submit"
            className="w-full rounded-lg bg-violet-600 py-3 font-semibold text-white shadow hover:bg-violet-700 transition-colors"
          >
            Submit Order
          </button>
        </form>
      </div>
    </div>
  )
}
