export type CashClosingExpenseSummary = {
  total: number
  efectivo: number
  transferencia: number
  tarjeta: number
  cantidad: number
}

export function emptyCashClosingExpenseSummary(): CashClosingExpenseSummary {
  return { total: 0, efectivo: 0, transferencia: 0, tarjeta: 0, cantidad: 0 }
}

function positiveAmount(value: unknown): number {
  const amount = Number(value || 0)
  return Number.isFinite(amount) && amount > 0 ? amount : 0
}

export function summarizeCashClosingExpenses(expenses: any[]): CashClosingExpenseSummary {
  return (Array.isArray(expenses) ? expenses : []).reduce((summary, expense) => {
    const amount = positiveAmount(expense?.cantidad ?? expense?.monto)
    if (amount <= 0) return summary

    const paymentMethod = String(expense?.metodo_pago || 'EFECTIVO').trim().toUpperCase()
    summary.total += amount
    summary.cantidad += 1

    if (paymentMethod === 'MIXTO') {
      const reportedCash = Math.min(amount, positiveAmount(expense?.efectivo))
      const reportedTransfer = Math.min(amount - reportedCash, positiveAmount(expense?.transferencia))
      summary.efectivo += reportedCash + (amount - reportedCash - reportedTransfer)
      summary.transferencia += reportedTransfer
    } else if (paymentMethod.includes('TRANSFERENCIA')) {
      summary.transferencia += amount
    } else if (paymentMethod.includes('TARJETA')) {
      summary.tarjeta += amount
    } else {
      summary.efectivo += amount
    }

    return summary
  }, emptyCashClosingExpenseSummary())
}
