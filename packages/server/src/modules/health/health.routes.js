'use strict'

const router = require('express').Router()
const { status } = require('@config/db')

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
