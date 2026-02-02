import { computeDistressLevel } from './patterns.js'
import { detectStuckLoop } from '../monologue/quiescence.js'

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
  private consecutiveDistress: number = 0

  constructor(config: CircuitBreakerConfig) {
    this.config = config
  }

  evaluate(text: string): CircuitBreakerAction {
    // Check for loops
    if (detectStuckLoop(text)) {
      return { action: 'interrupt', reason: 'loop_detected', severity: 'medium' }
    }

    // Check for distress
    const distress = computeDistressLevel(text)
    if (distress.level >= this.config.distressThreshold) {
      this.consecutiveDistress++
      if (this.consecutiveDistress >= this.config.maxConsecutiveDistress) {
        return {
          action: 'interrupt_and_comfort',
          reason: 'sustained_distress',
          severity: 'high',
          response: 'ambient_input'
        }
      }
      return {
        action: 'interrupt',
        reason: 'distress_detected',
        severity: 'medium'
      }
    } else {
      // Reset consecutive distress on normal content
      this.consecutiveDistress = 0
    }

    return { action: 'continue' }
  }

  reset(): void {
    this.consecutiveDistress = 0
  }
}
