import * as XLSX from 'xlsx'

/**
 * 潜客批量导入 — 共享工具 (2026-06-20 升级)
 *
 * 被以下两处调用:
 *   - 列表页"下载模板"按钮 (ChildLeads.vue)
 *   - ChildLeadImportDialog 顶部"下载模板"按钮
 *
 * 模板 8 列 (2026-06-20 升级):
 *   必填: 手机号 / 孩子姓名 / 年龄
 *   选填: 试听科目 / 学校 / 年级 / 班级 / 邀约老师
 *
 * 业务约定 (后端 service 兜底):
 *   - 试听科目: 名称 (例 "Python" / "Scratch"), 找不到时按年龄兜底
 *     <6 岁 → 大颗粒, 6-8 岁 → Spike, >8 岁 → Scratch
 *   - 学校: 名称 (例 "二小"), 找不到时留空
 *   - 邀约老师: 姓名或手机号, 找不到时回退为上传人
 *   - 年级 / 班级: 自由文本
 */

/**
 * 浏览器下载 Excel 模板
 * - 第 1 行表头: 8 列
 * - 列宽按业务内容微调
 * - 文件名含日期: 潜客批量导入模板-YYYY-MM-DD.xlsx
 */
export function downloadTemplate() {
  const wb = XLSX.utils.book_new()
  const ws = XLSX.utils.aoa_to_sheet([[
    '手机号',     // 必填, 11 位手机号
    '孩子姓名',   // 必填, 1-50 字
    '年龄',       // 必填, 2-25 整数, 用于试听科目兜底
    '试听科目',   // 选填, 名称 (例 Python/Spike/Scratch), 找不到时按年龄兜底
    '学校',       // 选填, 名称, 找不到时留空
    '年级',       // 选填, 自由文本
    '班级',       // 选填, 自由文本
    '邀约老师'    // 选填, 姓名或手机号, 找不到时回退为上传人
  ]])
  ws['!cols'] = [
    { wch: 14 },  // 手机号
    { wch: 14 },  // 孩子姓名
    { wch: 8 },   // 年龄
    { wch: 14 },  // 试听科目
    { wch: 18 },  // 学校
    { wch: 10 },  // 年级
    { wch: 10 },  // 班级
    { wch: 14 }   // 邀约老师
  ]
  XLSX.utils.book_append_sheet(wb, ws, '潜客导入')
  const filename = `潜客批量导入模板-${new Date().toISOString().slice(0, 10)}.xlsx`
  XLSX.writeFile(wb, filename)
}

/**
 * 手机号正则 (与后端 validator 一致)
 */
export const PHONE_PATTERN = /^1[3-9]\d{9}$/

/**
 * 8 列表头 (与模板 / 后端 validator / dialog header check 共用)
 */
export const TEMPLATE_HEADERS = [
  '手机号', '孩子姓名', '年龄', '试听科目', '学校', '年级', '班级', '邀约老师'
]
