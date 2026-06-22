'use strict'

const router = require('express').Router()
const { status } = require('@config/db')

// R-3300 GET /health
router.get('/', async (req, res) => {
  const db = await status()
  res.json({
    success: true,
    data: {
      uptime: process.uptime(),
      db,
      timestamp: new Date().toISOString()
    }
  })
})

module.exports = router
