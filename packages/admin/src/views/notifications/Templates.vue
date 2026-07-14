<!--
  Notification Templates.vue (admin 端) - 通知模板管理 (v0.9.1 重做, 2026-07-14)

  设计要点:
    - 7 条固定 type (后端 publish 调用的硬编码 key), 不允许 UI 新建 → 杜绝孤儿模板
    - type 用 "触发时机 + 接收人" 双维自然语言展示, 不暴露技术字符串
    - 内部 type 字符串以小灰字附在触发时机 cell 内, hover 给出 hint (供客服 / 开发定位)
    - 渠道列隐藏 (MVP 仅 inbox, 等 Phase 2/3 再展开)
    - "覆盖" → "重置" 语义修正, 且附带二级 confirm 弹窗 (destroy 操作)
    - 编辑弹窗 type 字段 read-only (强调它是技术约定, 不是用户输入)

  数据源:
    R-4010 listTemplates         列表
    R-4011 upsertTemplate        修改 title / body / isActive
    R-4017 removeTemplate        重置 (删本机构覆盖行, 回到平台默认)
-->
<template>
  <div class="page-templates">
    <div class="page-templates__header">
      <h2>通知模板</h2>
      <p class="page-templates__desc">
        7 类系统通知的文案与开关，全部走平台默认模板；
        你可以修改本机构的标题 / 正文 / 启用状态，或点「重置」回退为平台默认。
      </p>
    </div>

    <div class="page-templates__toolbar">
      <el-input
        v-model="filter.keyword"
        placeholder="搜索触发时机 / 接收人 / 标题"
        clearable
        style="width: 320px"
        @clear="recomputeView"
        @keyup.enter="recomputeView"
      />
    </div>

    <el-table :data="filteredTemplates" v-loading="loading" border stripe style="width: 100%">
      <!-- 触发时机 (主) + 内部 type 小灰字 -->
      <el-table-column label="触发时机" min-width="220">
        <template #default="{ row }">
          <div class="page-templates__trigger">
            <div class="page-templates__trigger-main">
              {{ row._trigger.triggerText }}
              <el-tag v-if="row.source === 'org'" type="warning" size="small" effect="plain">已修改</el-tag>
            </div>
            <el-tooltip :content="row._trigger.hint" placement="top" :show-after="200">
              <div class="page-templates__trigger-type">type: {{ row.type }}</div>
            </el-tooltip>
          </div>
        </template>
      </el-table-column>

      <!-- 接收人 chip (sub) -->
      <el-table-column label="接收人" width="180">
        <template #default="{ row }">
          <el-tag
            :type="row._trigger.recipientChipType"
            size="small"
            effect="light"
            class="page-templates__recipient"
          >
            <span class="page-templates__recipient-emoji">{{ row._trigger.recipientChip }}</span>
            {{ row._trigger.recipientText }}
          </el-tag>
        </template>
      </el-table-column>

      <!-- 标题 -->
      <el-table-column label="标题" min-width="200" show-overflow-tooltip>
        <template #default="{ row }">
          <span :class="{ 'page-templates__muted': row.source !== 'org' }">{{ row.title }}</span>
        </template>
      </el-table-column>

      <!-- 正文预览 -->
      <el-table-column label="正文预览" min-width="280" show-overflow-tooltip>
        <template #default="{ row }">
          <span :class="{ 'page-templates__muted': row.source !== 'org' }">{{ row.body }}</span>
        </template>
      </el-table-column>

      <!-- 启用 -->
      <el-table-column label="启用" width="80">
        <template #default="{ row }">
          <el-switch
            :model-value="row.isActive !== false"
            @change="(v) => onToggleActive(row, v)"
          />
        </template>
      </el-table-column>

      <!-- 操作: 编辑 / 重置 (仅已修改时显示重置) -->
      <el-table-column label="操作" width="160" fixed="right">
        <template #default="{ row }">
          <el-button type="primary" link @click="onEdit(row)">编辑</el-button>
          <el-button
            v-if="row.source === 'org'"
            type="danger"
            link
            @click="onReset(row)"
          >重置</el-button>
        </template>
      </el-table-column>
    </el-table>

    <!-- 编辑弹窗 (type read-only, 仅改 title/body/isActive) -->
    <el-dialog v-model="dialogVisible" :title="dialogTitle" width="640px" @closed="onDialogClosed">
      <el-form :model="form" label-width="100px" :rules="formRules" ref="formRef">
        <el-form-item label="触发时机">
          <div class="page-templates__form-static">
            {{ currentTriggerMeta.triggerText }} · {{ currentTriggerMeta.recipientText }}
          </div>
        </el-form-item>
        <el-form-item label="类型 (内部)">
          <el-input :model-value="form.type" disabled />
        </el-form-item>
        <el-form-item label="标题" prop="title">
          <el-input v-model="form.title" maxlength="256" show-word-limit />
        </el-form-item>
        <el-form-item label="正文" prop="body">
          <el-input v-model="form.body" type="textarea" :rows="4" maxlength="1024" show-word-limit />
        </el-form-item>
        <el-form-item label="启用">
          <el-switch v-model="form.isActive" />
        </el-form-item>
        <el-form-item label="占位符">
          <div class="page-templates__placeholders">
            <el-tag
              v-for="p in placeholders"
              :key="p"
              size="small"
              effect="plain"
              class="page-templates__placeholder"
            >{{ p }}</el-tag>
          </div>
          <div class="page-templates__hint">渲染时仅替换以上白名单占位符；其他字段会被忽略。</div>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="onSave">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script>
import { ElMessage, ElMessageBox } from 'element-plus'
import { notificationApi } from '@/api/notification'
import { NOTIFICATION_TRIGGERS, NOTIFICATION_TRIGGER_MAP } from '@/constants/notificationTriggers'

const PLACEHOLDERS = [
  '{studentName}', '{courseName}', '{time}', '{endTime}',
  '{room}', '{teacherName}', '{orgName}', '{orderNo}',
  '{amount}', '{points}', '{days}', '{reason}',
  // 2026-07-13 新增 (任务相关)
  '{taskTitle}', '{actorName}', '{comment}', '{score}',
  '{dueAt}', '{priority}', '{studentNames}'
]

export default {
  name: 'NotificationTemplates',
  data() {
    return {
      loading: false,
      saving: false,
      filter: { keyword: '' },
      templates: [],
      dialogVisible: false,
      form: {
        _id: null,
        type: '',
        channel: 'inbox',
        title: '',
        body: '',
        wechatTemplateId: '',
        smsTemplateCode: '',
        isActive: true
      },
      formRules: {
        title: [{ required: true, message: '请输入标题', trigger: 'blur' }],
        body: [{ required: true, message: '请输入正文', trigger: 'blur' }]
      },
      placeholders: PLACEHOLDERS
    }
  },
  computed: {
    /** 把后端 listTemplates 的 items 按 NOTIFICATION_TRIGGERS 顺序排序, 缺失的补占位 */
    sortedTemplates() {
      return this.templates
        .slice()
        .sort((a, b) => {
          const ai = NOTIFICATION_TRIGGERS.findIndex((t) => t.type === a.type)
          const bi = NOTIFICATION_TRIGGERS.findIndex((t) => t.type === b.type)
          return ai - bi
        })
        .map((row) => ({
          ...row,
          // 找不到时给 fallback, 不至于空白
          _trigger: NOTIFICATION_TRIGGER_MAP[row.type] || {
            triggerText: row.type,
            recipientText: '?',
            recipientChip: '❓',
            recipientChipType: 'info',
            hint: '未在 NOTIFICATION_TRIGGERS 字表里的 type'
          }
        }))
    },
    filteredTemplates() {
      const kw = (this.filter.keyword || '').toLowerCase().trim()
      if (!kw) return this.sortedTemplates
      return this.sortedTemplates.filter((t) => {
        if ((t.type || '').toLowerCase().includes(kw)) return true
        if ((t.title || '').toLowerCase().includes(kw)) return true
        if (t._trigger.triggerText.toLowerCase().includes(kw)) return true
        if (t._trigger.recipientText.toLowerCase().includes(kw)) return true
        return false
      })
    },
    dialogTitle() {
      return this.form._id ? '编辑通知模板' : '新建通知模板'
    },
    /** 当前编辑的 type 对应的触发时机描述 (编辑弹窗只读展示) */
    currentTriggerMeta() {
      return NOTIFICATION_TRIGGER_MAP[this.form.type] || {
        triggerText: this.form.type,
        recipientText: '?'
      }
    }
  },
  mounted() {
    this.load()
  },
  methods: {
    async load() {
      this.loading = true
      try {
        const res = await notificationApi.listTemplates()
        const data = res && res.data ? res.data : res
        // 后端 listTemplates 已按 org > platform 合并 + source 标记
        this.templates = (data && data.items) || (Array.isArray(data) ? data : [])
      } catch (e) {
        // listTemplates 后端未走 ApiResponse 标准包装的可能性兜底
        ElMessage.error(e.message || '加载失败')
        this.templates = []
      } finally {
        this.loading = false
      }
    },
    recomputeView() {
      // computed 自动重算, 这里给一个 hook 让模板的 @clear @keyup.enter 能优雅引用
    },
    resetForm() {
      this.form = {
        _id: null,
        type: '',
        channel: 'inbox',
        title: '',
        body: '',
        wechatTemplateId: '',
        smsTemplateCode: '',
        isActive: true
      }
    },
    onEdit(row) {
      this.form = {
        _id: row._id,
        type: row.type,
        channel: row.channel,
        title: row.title,
        body: row.body,
        wechatTemplateId: row.wechatTemplateId || '',
        smsTemplateCode: row.smsTemplateCode || '',
        isActive: row.isActive !== false
      }
      this.dialogVisible = true
    },
    async onToggleActive(row, v) {
      // 关闭平台默认开关时也走 upsert (创建一份禁用的 org 副本), 与原行为一致
      try {
        await notificationApi.upsertTemplate(row.type, row.channel, {
          title: row.title,
          body: row.body,
          isActive: v
        })
        ElMessage.success(v ? '已启用' : '已停用')
        await this.load()
      } catch (e) {
        ElMessage.error(e.message || '操作失败')
      }
    },
    async onReset(row) {
      try {
        await ElMessageBox.confirm(
          `确定把「${row._trigger.triggerText}」（${row._trigger.recipientText}）重置为平台默认模板？\n\n您已修改的文案 "${row.title}" 将被丢弃，操作不可撤销。`,
          '重置模板',
          {
            confirmButtonText: '确定重置',
            cancelButtonText: '取消',
            type: 'warning',
            confirmButtonClass: 'el-button--danger'
          }
        )
      } catch (e) {
        // 用户取消
        return
      }
      try {
        const r = await notificationApi.removeTemplate(row.type, row.channel)
        ElMessage.success(r && r.deleted ? '已重置为平台默认' : '已经是平台默认，无需重置')
        await this.load()
      } catch (e) {
        ElMessage.error(e.message || '重置失败')
      }
    },
    onSave() {
      this.$refs.formRef.validate(async (valid) => {
        if (!valid) return
        this.saving = true
        try {
          await notificationApi.upsertTemplate(this.form.type, this.form.channel, {
            title: this.form.title,
            body: this.form.body,
            wechatTemplateId: this.form.wechatTemplateId || null,
            smsTemplateCode: this.form.smsTemplateCode || null,
            isActive: this.form.isActive
          })
          ElMessage.success('已保存')
          this.dialogVisible = false
          await this.load()
        } catch (e) {
          ElMessage.error(e.message || '保存失败')
        } finally {
          this.saving = false
        }
      })
    },
    onDialogClosed() {
      this.resetForm()
    }
  }
}
</script>

<style lang="scss" scoped>
.page-templates {
  padding: 16px;

  &__header {
    margin-bottom: 16px;
    h2 { margin: 0 0 4px; }
  }
  &__desc {
    color: #606266;
    font-size: 14px;
    margin: 0;
  }
  &__toolbar {
    display: flex;
    gap: 8px;
    margin-bottom: 16px;
  }

  &__trigger {
    line-height: 1.4;
  }
  &__trigger-main {
    display: flex;
    align-items: center;
    gap: 6px;
    font-weight: 500;
  }
  &__trigger-type {
    color: #909399;
    font-size: 11px;
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    margin-top: 2px;
  }
  &__recipient {
    display: inline-flex;
    align-items: center;
    gap: 4px;
  }
  &__recipient-emoji {
    font-size: 13px;
  }
  &__muted {
    color: #909399;
    /* source='platform' 时的样式: 显示是平台默认的, 不让管理员以为这是他改的 */
    font-style: italic;
  }

  &__form-static {
    background: #f5f7fa;
    padding: 6px 10px;
    border-radius: 4px;
    color: #606266;
    font-size: 13px;
  }
  &__placeholders {
    line-height: 1.6;
  }
  &__placeholder {
    margin: 2px 4px;
  }
  &__hint {
    color: #909399;
    font-size: 12px;
    margin-top: 4px;
  }
}
</style>
