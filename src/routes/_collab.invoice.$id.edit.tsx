/**
 * Example child route with dynamic parameter: _collab.invoice.$id.edit.tsx
 *
 * This demonstrates entity-based collaboration where multiple users
 * can edit the same invoice simultaneously.
 *
 * Access this route at: /invoice/123/edit
 *
 * This route overrides the layout's roomId to use entity-based collaboration
 * instead of pathname-based collaboration.
 */

import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'
import { CollaborationHarness } from '../../components/CollaborationHarness'
import { SubmitControl } from '../../components/SubmitControl'

export const Route = createFileRoute('/_collab/invoice/$id/edit')({
  component: EditInvoice,
})

function EditInvoice() {
  const { id } = Route.useParams()
  const [submitted, setSubmitted] = useState(false)

  if (submitted) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-10">
        <div className="rounded-lg bg-green-50 border border-green-200 p-6 text-center">
          <div className="text-4xl mb-2">✅</div>
          <h2 className="text-xl font-bold text-green-900 mb-2">Invoice Saved!</h2>
          <p className="text-green-700 mb-4">Invoice #{id} has been updated.</p>
          <button
            onClick={() => setSubmitted(false)}
            className="rounded-lg bg-green-600 px-4 py-2 text-white hover:bg-green-700 transition"
          >
            Continue Editing
          </button>
        </div>
      </div>
    )
  }

  // Override the layout's roomId to use entity-based collaboration
  // All users editing invoice #123 will collaborate in the same room
  return (
    <CollaborationHarness
      roomId={`invoice-${id}`}
      submitMode="consensus" // Require all team members to mark ready
    >
      <div className="mx-auto max-w-3xl px-4 py-10">
        <div className="mb-6">
          <a href="/" className="text-sm text-violet-600 hover:underline">← Back to Invoices</a>
          <h1 className="mt-2 text-2xl font-bold text-gray-900">Edit Invoice #{id}</h1>
          <p className="mt-1 text-sm text-gray-500">
            Collaboration room: <code className="bg-gray-100 px-1 py-0.5 rounded">invoice-{id}</code>
          </p>
          <p className="mt-1 text-xs text-amber-600">
            ⚠️ Consensus mode enabled - all team members must mark ready before saving.
          </p>
        </div>

        <div className="rounded-2xl border border-gray-200 bg-white p-8 shadow-sm">
          <form>
            {/* Invoice Details */}
            <fieldset className="mb-6">
              <legend className="text-lg font-semibold text-gray-900 mb-3">
                Invoice Details
              </legend>

              <div className="space-y-3">
                <div>
                  <label htmlFor="invoiceNumber" className="block text-sm font-medium text-gray-700 mb-1">
                    Invoice Number
                  </label>
                  <input
                    id="invoiceNumber"
                    name="invoiceNumber"
                    type="text"
                    defaultValue={`INV-${id}`}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-200"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="invoiceDate" className="block text-sm font-medium text-gray-700 mb-1">
                      Invoice Date
                    </label>
                    <input
                      id="invoiceDate"
                      name="invoiceDate"
                      type="date"
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-200"
                    />
                  </div>

                  <div>
                    <label htmlFor="dueDate" className="block text-sm font-medium text-gray-700 mb-1">
                      Due Date
                    </label>
                    <input
                      id="dueDate"
                      name="dueDate"
                      type="date"
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-200"
                    />
                  </div>
                </div>
              </div>
            </fieldset>

            {/* Customer Information */}
            <fieldset className="mb-6">
              <legend className="text-lg font-semibold text-gray-900 mb-3">
                Bill To
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
                    placeholder="Acme Corporation"
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-200"
                  />
                </div>

                <div>
                  <label htmlFor="customerEmail" className="block text-sm font-medium text-gray-700 mb-1">
                    Email
                  </label>
                  <input
                    id="customerEmail"
                    name="customerEmail"
                    type="email"
                    placeholder="billing@acme.com"
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-200"
                  />
                </div>

                <div>
                  <label htmlFor="billingAddress" className="block text-sm font-medium text-gray-700 mb-1">
                    Billing Address
                  </label>
                  <textarea
                    id="billingAddress"
                    name="billingAddress"
                    rows={3}
                    placeholder="123 Business Ave, Suite 100&#10;San Francisco, CA 94102"
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-200"
                  />
                </div>
              </div>
            </fieldset>

            {/* Line Items */}
            <fieldset className="mb-6">
              <legend className="text-lg font-semibold text-gray-900 mb-3">
                Line Items
              </legend>

              <div className="space-y-4">
                <div className="grid grid-cols-12 gap-3">
                  <div className="col-span-6">
                    <label htmlFor="item1Description" className="block text-sm font-medium text-gray-700 mb-1">
                      Description
                    </label>
                    <input
                      id="item1Description"
                      name="item1Description"
                      type="text"
                      placeholder="Consulting Services"
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-200"
                    />
                  </div>
                  <div className="col-span-2">
                    <label htmlFor="item1Quantity" className="block text-sm font-medium text-gray-700 mb-1">
                      Qty
                    </label>
                    <input
                      id="item1Quantity"
                      name="item1Quantity"
                      type="number"
                      min="1"
                      defaultValue="1"
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-200"
                    />
                  </div>
                  <div className="col-span-2">
                    <label htmlFor="item1Rate" className="block text-sm font-medium text-gray-700 mb-1">
                      Rate
                    </label>
                    <input
                      id="item1Rate"
                      name="item1Rate"
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="150.00"
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-200"
                    />
                  </div>
                  <div className="col-span-2">
                    <label htmlFor="item1Amount" className="block text-sm font-medium text-gray-700 mb-1">
                      Amount
                    </label>
                    <input
                      id="item1Amount"
                      name="item1Amount"
                      type="number"
                      readOnly
                      placeholder="0.00"
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm bg-gray-50"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-12 gap-3">
                  <div className="col-span-6">
                    <input
                      id="item2Description"
                      name="item2Description"
                      type="text"
                      placeholder="Additional Services"
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-200"
                    />
                  </div>
                  <div className="col-span-2">
                    <input
                      id="item2Quantity"
                      name="item2Quantity"
                      type="number"
                      min="1"
                      defaultValue="1"
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-200"
                    />
                  </div>
                  <div className="col-span-2">
                    <input
                      id="item2Rate"
                      name="item2Rate"
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="0.00"
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-200"
                    />
                  </div>
                  <div className="col-span-2">
                    <input
                      id="item2Amount"
                      name="item2Amount"
                      type="number"
                      readOnly
                      placeholder="0.00"
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm bg-gray-50"
                    />
                  </div>
                </div>
              </div>
            </fieldset>

            {/* Payment Terms */}
            <fieldset className="mb-6">
              <legend className="text-lg font-semibold text-gray-900 mb-3">
                Payment Terms
              </legend>

              <div className="space-y-3">
                <div>
                  <label htmlFor="paymentTerms" className="block text-sm font-medium text-gray-700 mb-1">
                    Terms
                  </label>
                  <select
                    id="paymentTerms"
                    name="paymentTerms"
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-200"
                  >
                    <option value="">Select payment terms...</option>
                    <option value="due-on-receipt">Due on Receipt</option>
                    <option value="net-15">Net 15</option>
                    <option value="net-30">Net 30</option>
                    <option value="net-60">Net 60</option>
                  </select>
                </div>

                <div>
                  <label htmlFor="notes" className="block text-sm font-medium text-gray-700 mb-1">
                    Notes
                  </label>
                  <textarea
                    id="notes"
                    name="notes"
                    rows={2}
                    placeholder="Thank you for your business!"
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-200"
                  />
                </div>
              </div>
            </fieldset>

            {/* Submit with consensus mode */}
            <SubmitControl
              submitText="Save Invoice"
              onSubmit={() => setSubmitted(true)}
            />
          </form>
        </div>
      </div>
    </CollaborationHarness>
  )
}
