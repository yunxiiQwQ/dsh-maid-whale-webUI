import { describe, expect, it } from 'vitest'
import { activityCopy, activityStage, statusCopy, statusCopyLibrary, taskCopy } from '../src/host/status-copy.js'

describe('companion status copy', () => {
  it('stays varied, friendly, and deterministic', () => {
    for (const variants of Object.values(statusCopyLibrary)) expect(variants.length).toBeGreaterThanOrEqual(2)
    expect(statusCopy('success', 1)).toBe(statusCopy('success', 1))
    expect(statusCopy('success', 1)).not.toBe(statusCopy('success', 2))
    expect(statusCopy('waiting', 0)).toMatch(/你|确认/u)
  })

  it('hides technical tool names behind human stages', () => {
    expect(activityStage('testing')).toBe('验证阶段')
    expect(activityCopy('searching', 0)).toMatch(/找|查看/u)
    expect(activityCopy('commanding', 1)).not.toMatch(/shell_command/u)
  })

  it('adds restrained conversational particles to task copy', () => {
    expect(taskCopy('修改登录模块')).toBe('正在修改登录模块呢')
    expect(taskCopy('正在运行测试')).toBe('正在运行测试呢')
    expect(taskCopy('Ship the release')).toBe('正在处理「Ship the release」呢')
  })
})
