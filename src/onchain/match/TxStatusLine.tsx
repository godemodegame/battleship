/**
 * Shared transaction status display (GAME-503 / GAME-511 / GAME-512).
 *
 * Renders one tracked write's lifecycle: wallet confirmation, pending (with an
 * explorer link to the hash), replacement note, confirmation, and mapped
 * failure with an optional retry action. Player-facing text only — raw codes
 * never reach this component.
 */

import { errorMessage } from '../../copy/errors'
import { explorerCopy, txCopy } from '../../copy/en'
import { explorerTxUrl } from '../explorer'
import type { TxState } from '../client/txTracker'

export interface TxStatusLineProps {
  state: TxState
  /** Offered on terminal failures; resets the tracked write for a retry. */
  onRetry?: () => void
}

export function TxStatusLine({ state, onRetry }: TxStatusLineProps) {
  if (state.phase === 'idle') return null

  return (
    <div className="tx-status" data-testid="tx-status" data-tx-phase={state.phase}>
      {state.phase === 'wallet' && <p className="status-sub">{txCopy.confirmInWallet}</p>}
      {state.phase === 'pending' && <p className="status-sub">{txCopy.pending}</p>}
      {state.phase === 'success' && <p className="status-sub ok">{txCopy.confirmed}</p>}
      {state.replaced && state.phase !== 'success' && (
        <p className="footnote" data-testid="tx-replaced">
          {txCopy.replacedNote}
        </p>
      )}
      {state.phase === 'error' && (
        <>
          <p className="error-note" role="alert" data-testid="tx-error">
            {errorMessage(state.error ?? 'unknown')}
          </p>
          {onRetry && (
            <button className="btn small" data-testid="tx-retry" onClick={onRetry}>
              {txCopy.retry}
            </button>
          )}
        </>
      )}
      {state.hash && (
        <a
          className="footnote explorer-link"
          data-testid="tx-explorer-link"
          href={explorerTxUrl(state.hash)}
          target="_blank"
          rel="noopener noreferrer"
        >
          {explorerCopy.viewTx}
        </a>
      )}
    </div>
  )
}
