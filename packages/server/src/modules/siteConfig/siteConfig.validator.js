'use strict'

const { body } = require('express-validator')

const update = [
  body('copyrightYear').optional().isString().isLength({ max: 10 }),
  body('operatorName').optional().isString().isLength({ max: 100 }),
  body('operatorAddress').optional().isString().isLength({ max: 200 }),
  body('operatorContact').optional().isString().isLength({ max: 100 }),
  body('icpNumber').optional().isString().isLength({ max: 100 }),
  body('policeBeianNumber').optional().isString().isLength({ max: 100 }),
  body('customerServicePhone').optional().isString().isLength({ max: 50 }),
  body('platformLogo').optional({ nullable: true }).isMongoId()
]

module.exports = { update }
