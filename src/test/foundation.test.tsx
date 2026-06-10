import { useState } from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

function FoundationProbe() {
  const [ready, setReady] = useState(false)

  return <button onClick={() => setReady(true)}>{ready ? 'Ready' : 'Start'}</button>
}

describe('test foundation', () => {
  it('renders and handles interaction in jsdom', async () => {
    const user = userEvent.setup()

    render(<FoundationProbe />)
    await user.click(screen.getByRole('button', { name: 'Start' }))

    expect(screen.getByRole('button', { name: 'Ready' })).toBeTruthy()
  })
})
