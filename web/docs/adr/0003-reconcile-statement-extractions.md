# Reconcile statement extractions before import

Every supported statement transformer must reconcile its extracted Transactions against independent, provider-specific control totals before returning a result. Statement Import fails closed when reconciliation is unavailable or unsuccessful; this favors protection from silently incomplete financial data over accepting statements whose extraction cannot be proven complete.
