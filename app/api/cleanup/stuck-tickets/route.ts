/**
 * API endpoint for cleaning up tickets stuck in 'in_review' status
 */

import { NextResponse } from 'next/server'
import { db } from '../../../../lib/db'
import { findStuckTickets, markTicketDone, markTicketReady } from '../../../../lib/cleanup/stuck-tickets'

/**
 * GET /api/cleanup/stuck-tickets?projectId=xxx
 * Find tickets stuck in 'in_review' without open PRs
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const projectId = searchParams.get('projectId')
    
    if (!projectId) {
      return NextResponse.json(
        { error: 'projectId parameter is required' },
        { status: 400 }
      )
    }
    
    const stuckTickets = findStuckTickets(db, projectId)
    
    return NextResponse.json({ 
      stuck_tickets: stuckTickets,
      count: stuckTickets.length
    })
  } catch (error) {
    console.error('Error finding stuck tickets:', error)
    return NextResponse.json(
      { error: 'Failed to find stuck tickets' },
      { status: 500 }
    )
  }
}

/**
 * POST /api/cleanup/stuck-tickets
 * Mark a stuck ticket as done or ready
 */
export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { ticketId, action } = body
    
    if (!ticketId || !action) {
      return NextResponse.json(
        { error: 'ticketId and action are required' },
        { status: 400 }
      )
    }
    
    if (action !== 'done' && action !== 'ready') {
      return NextResponse.json(
        { error: 'action must be "done" or "ready"' },
        { status: 400 }
      )
    }
    
    if (action === 'done') {
      markTicketDone(db, ticketId)
    } else {
      markTicketReady(db, ticketId)
    }
    
    return NextResponse.json({ 
      success: true, 
      ticketId, 
      action,
      message: `Ticket marked as ${action}`
    })
  } catch (error) {
    console.error('Error updating stuck ticket:', error)
    return NextResponse.json(
      { error: 'Failed to update ticket status' },
      { status: 500 }
    )
  }
}