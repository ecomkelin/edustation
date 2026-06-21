'use strict'

/**
 * Pet Catalog Admin Controller（2026-06-21 pet-system-v2-ext）
 *
 * 三个 catalog（species / items / consumables）的 CRUD HTTP 端点。
 * 复用 petCatalog.admin.service，统一以 (orgId, operatorId, payload) 形式传参。
 */

const s = require('@modules/pet/petCatalog.admin.service')

function wrap(fn) {
  return async (req, res, next) => {
    try { await fn(req, res, next) } catch (e) { next(e) }
  }
}

/* ─── Species ─────────────────────────────────── */

exports.listSpecies = wrap(async (req, res) => {
  const items = await s.listSpecies({
    orgId: req.orgId,
    tier: req.query.tier,
    isActive: req.query.isActive !== undefined ? req.query.isActive === 'true' : undefined,
    keyword: req.query.keyword
  })
  res.json({ success: true, data: { items } })
})

exports.getSpecies = wrap(async (req, res) => {
  const data = await s.getSpecies({ orgId: req.orgId, id: req.params.id })
  res.json({ success: true, data })
})

exports.createSpecies = wrap(async (req, res) => {
  const data = await s.createSpecies({
    orgId: req.orgId,
    payload: req.body || {},
    operatorId: req.user && req.user.id
  })
  res.status(201).json({ success: true, data })
})

exports.updateSpecies = wrap(async (req, res) => {
  const data = await s.updateSpecies({
    orgId: req.orgId,
    id: req.params.id,
    payload: req.body || {},
    operatorId: req.user && req.user.id
  })
  res.json({ success: true, data })
})

exports.removableCheckSpecies = wrap(async (req, res) => {
  const data = await s.removableCheckSpecies({ orgId: req.orgId, id: req.params.id })
  res.json({ success: true, data })
})

exports.removeSpecies = wrap(async (req, res) => {
  const data = await s.removeSpecies({ orgId: req.orgId, id: req.params.id })
  res.json({ success: true, data })
})

/* ─── Items ─────────────────────────────────── */

exports.listItems = wrap(async (req, res) => {
  const items = await s.listItems({
    orgId: req.orgId,
    slot: req.query.slot,
    isActive: req.query.isActive !== undefined ? req.query.isActive === 'true' : undefined,
    keyword: req.query.keyword
  })
  res.json({ success: true, data: { items } })
})

exports.getItem = wrap(async (req, res) => {
  const data = await s.getItem({ orgId: req.orgId, id: req.params.id })
  res.json({ success: true, data })
})

exports.createItem = wrap(async (req, res) => {
  const data = await s.createItem({
    orgId: req.orgId,
    payload: req.body || {},
    operatorId: req.user && req.user.id
  })
  res.status(201).json({ success: true, data })
})

exports.updateItem = wrap(async (req, res) => {
  const data = await s.updateItem({
    orgId: req.orgId,
    id: req.params.id,
    payload: req.body || {},
    operatorId: req.user && req.user.id
  })
  res.json({ success: true, data })
})

exports.removableCheckItem = wrap(async (req, res) => {
  const data = await s.removableCheckItem({ orgId: req.orgId, id: req.params.id })
  res.json({ success: true, data })
})

exports.removeItem = wrap(async (req, res) => {
  const data = await s.removeItem({ orgId: req.orgId, id: req.params.id })
  res.json({ success: true, data })
})

/* ─── Consumables ─────────────────────────────────── */

exports.listConsumables = wrap(async (req, res) => {
  const items = await s.listConsumables({
    orgId: req.orgId,
    kind: req.query.kind,
    isActive: req.query.isActive !== undefined ? req.query.isActive === 'true' : undefined,
    keyword: req.query.keyword
  })
  res.json({ success: true, data: { items } })
})

exports.getConsumable = wrap(async (req, res) => {
  const data = await s.getConsumable({ orgId: req.orgId, id: req.params.id })
  res.json({ success: true, data })
})

exports.createConsumable = wrap(async (req, res) => {
  const data = await s.createConsumable({
    orgId: req.orgId,
    payload: req.body || {},
    operatorId: req.user && req.user.id
  })
  res.status(201).json({ success: true, data })
})

exports.updateConsumable = wrap(async (req, res) => {
  const data = await s.updateConsumable({
    orgId: req.orgId,
    id: req.params.id,
    payload: req.body || {},
    operatorId: req.user && req.user.id
  })
  res.json({ success: true, data })
})

exports.removableCheckConsumable = wrap(async (req, res) => {
  const data = await s.removableCheckConsumable({ orgId: req.orgId, id: req.params.id })
  res.json({ success: true, data })
})

exports.removeConsumable = wrap(async (req, res) => {
  const data = await s.removeConsumable({ orgId: req.orgId, id: req.params.id })
  res.json({ success: true, data })
})