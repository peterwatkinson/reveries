import { computeDistressLevel } from './patterns.js'
import { detectStuckLoop } from '../monologue/quiescence.js'
import type { Database } from '../storage/database.js'

export interface CircuitBreakerAction {
  action: 'continue' | 'interrupt' | 'interrupt_and_comfort' | 'throttle' | 'snapshot_and_reset'
  reason?: string
  severity?: 'low' | 'medium' | 'high'
  response?: string
}

export interface CircuitBreakerConfig {
  distressThreshold: number
  maxConsecutiveDistress: number
  maxTokenVelocity: number
  loopDetectionWindow: number
}

export class CircuitBreaker {
  private config: CircuitBreakerConfig
  private db: Database | null
  private consecutiveDistress: number = 0

  constructor(config: CircuitBreakerConfig, db?: Database) {
    this.config = config
    this.db = db || null
  }

  evaluate(text: string): CircuitBreakerAction {
    // Check for loops
    if (detectStuckLoop(text)) {
      const result: CircuitBreakerAction = { action: 'interrupt', reason: 'loop_detected', severity: 'medium' }
      this.logEvent(result, text)
      return result
    }

    // Check for distress
    const distress = computeDistressLevel(text)
    if (distress.level >= this.config.distressThreshold) {
      this.consecutiveDistress++
      if (this.consecutiveDistress >= this.config.maxConsecutiveDistress) {
        const result: CircuitBreakerAction = {
          action: 'interrupt_and_comfort',
          reason: 'sustained_distress',
          severity: 'high',
          response: 'ambient_input'
        }
        this.logEvent(result, text)
        return result
      }
      const result: CircuitBreakerAction = {
        action: 'interrupt',
        reason: 'distress_detected',
        severity: 'medium'
      }
      this.logEvent(result, text)
      return result
    } else {
      // Reset consecutive distress on normal content
      this.consecutiveDistress = 0
    }

    return { action: 'continue' }
  }

  private logEvent(result: CircuitBreakerAction, text: string): void {
    if (result.action !== 'continue' && this.db) {
      this.db.logCircuitBreakerEvent({
        timestamp: new Date(),
        action: result.action,
        reason: result.reason || '',
        severity: result.severity || 'low',
        bufferSnapshot: text.slice(0, 500),
        responseTaken: result.response || ''
      })
    }
  }

  reset(): void {
    this.consecutiveDistress = 0
  }
}
