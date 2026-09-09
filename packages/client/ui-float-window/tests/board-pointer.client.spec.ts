// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { pointerOnBoard, clientOnBoard } from '../src/client/board-pointer.ts'

describe('pointerOnBoard', () => {
  it('subtracts the overlay board origin from client coordinates', () => {
    const board = document.createElement('div')
    board.setAttribute('data-overlay-board', '')
    board.getBoundingClientRect = () => ({
      x: 20, y: 40, left: 20, top: 40, right: 220, bottom: 240, width: 200, height: 200,
      toJSON() { return {} },
    })
    const handle = document.createElement('div')
    board.append(handle)
    document.body.append(board)
    expect(pointerOnBoard({ currentTarget: handle, clientX: 50, clientY: 90 })).toEqual({
      x: 30, y: 50,
    })
    board.remove()
  })

  it('passes through client coordinates when no board ancestor exists', () => {
    const orphan = document.createElement('div')
    expect(pointerOnBoard({ currentTarget: orphan, clientX: 12, clientY: 8 })).toEqual({
      x: 12, y: 8,
    })
    expect(pointerOnBoard({ currentTarget: {}, clientX: 3, clientY: 4 })).toEqual({
      x: 3, y: 4,
    })
    expect(clientOnBoard(9, 7, undefined)).toEqual({ x: 9, y: 7 })
  })
})
