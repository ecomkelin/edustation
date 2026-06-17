'use strict'

const { marked } = require('marked')
const LegalDoc = require('@models/LegalDoc.model')

/**
 * 机构创建时自动 seed 默认的机构级法律协议 (2026-06).
 *
 * 在 org.service.create 末尾调用. 给新机构填两份默认协议:
 *   - purchase-agreement: 课程购买协议 (下单必勾, requireScope='order', isRequired=true)
 *   - refund-policy: 退费规则 (下单必勾)
 *
 * 其他 key (org-about / org-faq / points-rule / share-rule / org-contact)
 * 不主动 seed, 由机构 admin 按需新建.
 *
 * 幂等: 已存在同 (org, key, isActive=true) 时跳过.
 */

const DEFAULTS = [
  {
    key: 'purchase-agreement',
    title: '课程购买协议',
    isRequired: true,
    requireScope: 'order',
    contentMarkdown: `# 课程购买协议

**版本:1.0.0**

> 本协议示范文本由系统自动生成,机构 admin 可在「机构协议」中按本机构实际情况编辑。**正式上线前,请将本文本替换为经法务审阅的版本。**

## 一、协议双方

1.1 本协议是您(以下称"家长")与本培训机构(以下称"机构")就您为受益学员购买培训课程所订立的服务协议。

1.2 您在勾选"我已阅读并同意"并完成支付时,本协议立即生效。

## 二、课程服务

2.1 您所购买的课程产品名称、课时数、单价、有效期均以订单详情为准。

2.2 课程在课程产品有效期内消耗,过期未消耗的课时按本协议第四条退费规则处理。

2.3 机构有权根据教学需要调整任课教师、上课时间、教室位置等具体安排,但课程产品的总课时、有效期、单价不变。

## 三、付款与开具发票

3.1 您应在订单创建后按约定金额完成支付。支付完成后,系统自动为受益学员开通对应的学员课包。

3.2 您可在订单详情页申请开具发票,具体抬头由您填写。

## 四、退费条款

详见《退费规则》。简要约定:
- 未消耗课时数 ≥ 总课时 70%:可全额退费(扣除手续费 5%)
- 未消耗课时数 ≥ 总课时 30%:按未消耗课时比例退费(扣除手续费 10%)
- 未消耗课时数 < 总课时 30%:按未消耗课时比例退费(扣除手续费 20%)
- 因机构原因导致无法继续提供服务的,全额退还未消耗部分

## 五、违约责任

5.1 因您原因(如学员长期请假、违反机构规章被劝退)导致课程无法继续的,按第四条退费规则结算。

5.2 因机构原因(如机构停业、关闭)导致课程无法继续的,机构全额退还您未消耗课程的相应费用。

## 六、争议解决

6.1 本协议适用中华人民共和国法律。

6.2 因本协议产生的争议,双方应友好协商解决;协商不成的,任何一方均可向机构所在地有管辖权的人民法院起诉。

## 七、其他

7.1 本协议自您勾选同意并完成支付时生效,至所购课程全部消耗或退费结清时终止。

7.2 您与机构的任何口头约定均不构成本协议组成部分;如需变更,以双方书面补充协议为准。

---

**机构 admin 请编辑此处填入机构全称、联系电话**`
  },
  {
    key: 'refund-policy',
    title: '退费规则',
    isRequired: true,
    requireScope: 'order',
    contentMarkdown: `# 退费规则

**版本:1.0.0**

> 本规则示范文本由系统自动生成,机构 admin 可按本机构实际政策编辑。**正式上线前,请将本文本替换为经法务审阅的版本。**

## 一、退费总原则

1.1 课程一经购买,您可申请退费但须按本规则扣除相应费用。

1.2 退费金额 = (未消耗课时 / 总课时) × 实付金额 × (1 - 手续费率)

## 二、退费阶梯

| 已消耗比例 | 手续费率 | 说明 |
|----------|---------|------|
| ≤ 30% | 5% | 退费可达 95% × 未消耗占比 |
| 30% - 70% | 10% | 退费可达 90% × 未消耗占比 |
| > 70% | 20% | 退费可达 80% × 未消耗占比 |

## 三、特殊情形

3.1 **因学员身体原因**(需提供三甲医院证明)中止课程的,**全额退**未消耗部分,不扣手续费。

3.2 **因机构原因**导致无法继续提供服务(如机构停业、关闭、教师团队解散)的,**全额退**未消耗部分,且额外赔付实付金额 10% 作为补偿。

3.3 **课程购买后 7 天内、且尚未实际上课**的,可无条件全额退费(不扣手续费)。

## 四、退费办理流程

4.1 您可在「我的订单」找到对应订单,点击"申请退费"按钮提交申请。

4.2 申请提交后,机构教务在 3 个工作日内审核;审核通过后,7 个工作日内退回您的原支付账户。

4.3 如对审核结果有异议,您可联系机构负责人或拨打机构客服电话沟通。

## 五、不予退费的情形

5.1 已超过课程产品有效期的课时,视为放弃,不予退费。

5.2 通过赠课方式获得的课时,不可申请退费(但可在有效期内继续使用)。

5.3 已超过 1 年未与机构联系且未上课的课时,机构有权按"未消耗"处理,但您仍可凭购买凭证申请退费(适用本规则三、四条)。

## 六、争议解决

如对本退费规则有任何疑问,请联系机构教务或拨打机构客服电话。如协商不成,可向当地消费者协会或人民法院投诉/起诉。

---

**机构 admin 请编辑此处填入机构客服电话与营业时间**`
  }
]

/**
 * 给指定机构 seed 默认协议. 幂等: 已存在的 key 不重复创建.
 */
async function seedDefaultLegalDocs(orgId) {
  if (!orgId) return { created: 0, existing: 0 }
  const existing = await LegalDoc.find({
    org: orgId,
    isActive: true,
    key: { $in: DEFAULTS.map((d) => d.key) }
  }).select('key').lean()
  const existingKeys = new Set(existing.map((d) => d.key))

  const toCreate = DEFAULTS.filter((d) => !existingKeys.has(d.key))
  if (!toCreate.length) return { created: 0, existing: existing.length }

  const docs = toCreate.map((d) => ({
    org: orgId,
    key: d.key,
    title: d.title,
    contentMarkdown: d.contentMarkdown,
    contentHtml: marked.parse(d.contentMarkdown),
    version: '1.0.0',
    isActive: true,
    isRequired: d.isRequired,
    requireScope: d.requireScope
  }))
  try {
    await LegalDoc.insertMany(docs, { ordered: false })
    return { created: docs.length, existing: existing.length }
  } catch (e) {
    if (e && e.code === 11000) {
      // 并发 / 已存在被 unique 拦截, 视作幂等成功
      return { created: 0, existing: existing.length + docs.length, conflict: true }
    }
    throw e
  }
}

module.exports = { seedDefaultLegalDocs, DEFAULTS }
