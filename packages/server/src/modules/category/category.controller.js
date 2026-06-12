'use strict'

const s = require('./category.service')
const ApiResponse = require('@utils/ApiResponse')

exports.list = async (req, res) => res.json(ApiResponse.ok(await s.list(req.query)))
exports.tree = async (req, res) => res.json(ApiResponse.ok(await s.tree(req.query)))
exports.detail = async (req, res) => res.json(ApiResponse.ok(await s.detail(req.params.id)))
exports.create = async (req, res) => res.status(201).json(ApiResponse.created(await s.create(req.body)))
exports.update = async (req, res) => res.json(ApiResponse.ok(await s.update(req.params.id, req.body)))
exports.remove = async (req, res) => res.json(ApiResponse.ok(await s.remove(req.params.id)))
exports.removableCheck = async (req, res) => res.json(ApiResponse.ok(await s.removableCheck(req.params.id)))
