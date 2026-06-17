'use strict'

const SiteConfig = require('@models/SiteConfig.model')
const ApiError = require('@utils/ApiError')
const { REF_ENTITY } = require('@models/File.model')
const fileBind = require('@modules/storage/fileBind')

/**
 * 平台站点配置 (SiteConfig) 业务逻辑
 *
 * 平台级单例 (scope='global'), 启动时 ensureSingleton 自动 upsert.
 *
 * 写入仅限平台超管, 读取公开 (admin Footer / client "我的"页底部都要展示).
 */

const UPDATABLE_FIELDS = [
  'copyrightYear', 'operatorName', 'operatorAddress', 'operatorContact',
  'icpNumber', 'policeBeianNumber', 'customerServicePhone',
  'platformLogo'
]

/**
 * 启动时调用. 数据库无 'global' 单例时插入一条空文档.
 * 幂等: 已有则 no-op.
 */
async function ensureSingleton() {
  const existing = await SiteConfig.findOne({ scope: 'global' }).select('_id').lean()
  if (existing) return { status: 'exists' }
  await SiteConfig.create({
    scope: 'global',
    copyrightYear: String(new Date().getFullYear())
  })
  // eslint-disable-next-line no-console
  console.log(`[site-config] singleton created`)
  return { status: 'created' }
}

async function get() {
  const cfg = await SiteConfig.findOne({ scope: 'global' }).lean()
  if (cfg) return cfg
  // 兜底: 单例丢失时返回空对象 (启动后正常不应命中, 但避免 500)
  return {
    scope: 'global',
    copyrightYear: String(new Date().getFullYear()),
    operatorName: '',
    operatorAddress: '',
    operatorContact: '',
    icpNumber: '',
    policeBeianNumber: '',
    customerServicePhone: '',
    platformLogo: null
  }
}

async function update(payload, options = {}) {
  const set = {}
  for (const k of UPDATABLE_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(payload, k)) {
      set[k] = payload[k]
    }
  }
  if (Object.keys(set).length === 0) return get()

  const before = await SiteConfig.findOne({ scope: 'global' }).lean()
  const updated = await SiteConfig.findOneAndUpdate(
    { scope: 'global' },
    { $set: set },
    { upsert: true, new: true, setDefaultsOnInsert: true, runValidators: true }
  ).lean()

  // 维护 platformLogo File 引用 (与 OrgPromotion 一致的 fileBind 风格)
  if (Object.prototype.hasOwnProperty.call(set, 'platformLogo')) {
    try {
      await fileBind.diffSingleById({
        // 平台 logo 不属于任何机构, fileBind 走 null org (允许 File.org=null)
        orgId: options.fileBindOrgId || null,
        oldId: before ? before.platformLogo : null,
        newId: set.platformLogo,
        entity: REF_ENTITY.SITE_CONFIG || 'site_config',
        entityId: updated._id,
        field: 'platformLogo'
      })
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('[siteConfig.update] platformLogo diffSingleById FAILED:', e)
    }
  }

  return updated
}

module.exports = { ensureSingleton, get, update, UPDATABLE_FIELDS }
