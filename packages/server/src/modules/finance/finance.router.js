'use strict'

/**
 * 财务模块路由 (2026-06-25 立项)
 *
 * 基础路径: /api/v1/finance
 * 中间件链: mws.authenticate → mws.requireOrg → mws.requirePermission(...)
 * 权限码: finance.read / finance.write
 *
 * 路由编号 (R-MMPP, MM=34):
 *   R-3400 GET    /finance/accounts
 *   R-3401 GET    /finance/accounts/primary
 *   R-3402 GET    /finance/accounts/:id
 *   R-3403 POST   /finance/accounts
 *   R-3404 PUT    /finance/accounts/:id
 *   R-3405 DELETE /finance/accounts/:id        (requirePlatformPassword)
 *   R-3406 GET    /finance/accounts/:id/removable-check
 *   R-3410 GET    /finance/transactions
 *   R-3411 GET    /finance/transactions/summary
 *   R-3412 GET    /finance/transactions/:id
 *   R-3413 POST   /finance/transactions
 *   R-3414 POST   /finance/transactions/transfer
 *   R-3420 GET    /finance/reasons
 *   R-3421 POST   /finance/reasons
 *   R-3422 PUT    /finance/reasons/:id
 *   R-3423 DELETE /finance/reasons/:id         (requirePlatformPassword)
 *   R-3424 GET    /finance/reasons/:id/removable-check
 */

const router = require('express').Router()

const accC = require('./financeAccount.controller')
const accV = require('./financeAccount.validator')
const txC = require('./financeTransaction.controller')
const txV = require('./financeTransaction.validator')
const rsnC = require('./financeReason.controller')
const rsnV = require('./financeReason.validator')

const mws = require('@middlewares')
const asyncHandler = require('@utils/asyncHandler')

router.use(mws.authenticate, mws.requireOrg)

// ── 账本 accounts ──
router.get('/accounts', mws.requirePermission('finance.read'), accV.listAccounts, asyncHandler(accC.list))                       // R-3400
router.get('/accounts/primary', mws.requirePermission('finance.read'), asyncHandler(accC.getPrimary))                            // R-3401
router.get('/accounts/:id/removable-check', mws.requirePermission('finance.read'), accV.idParam, asyncHandler(accC.removableCheck)) // R-3406
router.get('/accounts/:id', mws.requirePermission('finance.read'), accV.idParam, asyncHandler(accC.detail))                      // R-3402
router.post('/accounts', mws.requirePermission('finance.write'), accV.create, mws.validateRequest, asyncHandler(accC.create))     // R-3403
router.put('/accounts/:id', mws.requirePermission('finance.write'), accV.update, mws.validateRequest, asyncHandler(accC.update)) // R-3404
router.delete('/accounts/:id', mws.requirePlatformPassword, accV.idParam, asyncHandler(accC.remove))                              // R-3405

// ── 流水 transactions ──
router.get('/transactions', mws.requirePermission('finance.read'), txV.listTx, asyncHandler(txC.list))                           // R-3410
router.get('/transactions/summary', mws.requirePermission('finance.read'), txV.summaryQuery, asyncHandler(txC.summary))         // R-3411
router.get('/transactions/:id', mws.requirePermission('finance.read'), txV.idParam, asyncHandler(txC.detail))                    // R-3412
router.post('/transactions', mws.requirePermission('finance.write'), txV.createTx, mws.validateRequest, asyncHandler(txC.create)) // R-3413
router.post('/transactions/transfer', mws.requirePermission('finance.write'), txV.transfer, mws.validateRequest, asyncHandler(txC.transfer)) // R-3414

// ── 字典 reasons ──
router.get('/reasons', mws.requirePermission('finance.read'), rsnV.listReasons, asyncHandler(rsnC.list))                         // R-3420
router.get('/reasons/:id/removable-check', mws.requirePermission('finance.read'), rsnV.idParam, asyncHandler(rsnC.removableCheck)) // R-3424
router.post('/reasons', mws.requirePermission('finance.write'), rsnV.createReason, mws.validateRequest, asyncHandler(rsnC.create)) // R-3421
router.put('/reasons/:id', mws.requirePermission('finance.write'), rsnV.updateReason, mws.validateRequest, asyncHandler(rsnC.update)) // R-3422
router.delete('/reasons/:id', mws.requirePlatformPassword, rsnV.idParam, asyncHandler(rsnC.remove))                              // R-3423

module.exports = router
