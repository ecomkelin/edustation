<!--
  Notification Templates.vue (admin 端) - 通知模板管理
  - 数据源 R-4010 listTemplates / R-4011 upsertTemplate
  - 表格: type / channel / source (机构/平台) / 标题 / 正文摘要 / 是否启用 / 操作
  - 编辑弹窗: title / body / isActive / 渠道特定字段 (wechatTemplateId / smsTemplateCode)
  - 占位符提示: {studentName} {courseName} {time} {room} 等
-->
<template>
  <div class="page-templates">
    <div class="page-templates__header">
      <h2>通知模板</h2>
      <p class="page-templates__desc">
        管理本机构通知模板；机构可覆盖平台默认模板（按 type + channel upsert）。
        MVP 仅 inbox 渠道；微信订阅消息 / 短信模板字段保留供 Phase 2/3 启用。
      </p>
    </div>

    <div class="page-templates__toolbar">
      <el-input v-model="filter.keyword" placeholder="搜索 type / 标题" clearable style="width: 280px" @clear="load" @keyup.enter="load" />
      <el-button type="primary" @click="onAdd">新建模板</el-button>
    </div>

    <el-table :data="filteredTemplates" v-loading="loading" border stripe style="width: 100%">
      <el-table-column prop="type" label="类型" width="180" />
      <el-table-column prop="channel" label="渠道" width="100">
        <template #default="{ row }">
          <el-tag :type="row.channel === 'inbox' ? 'success' : 'info'" size="small">{{ row.channel }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="来源" width="100">
        <template #default="{ row }">
          <el-tag :type="row.source === 'org' ? 'warning' : 'info'" size="small">{{ row.source === 'org' ? '机构' : '平台默认' }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="title" label="标题" min-width="200" show-overflow-tooltip />
      <el-table-column label="正文预览" min-width="280" show-overflow-tooltip>
        <template #default="{ row }">{{ row.body }}</template>
      </el-table-column>
      <el-table-column label="启用" width="80">
        <template #default="{ row }">
          <el-switch :model-value="row.isActive" @change="(v) => onToggleActive(row, v)" />
        </template>
      </el-table-column>
      <el-table-column label="操作" width="140" fixed="right">
        <template #default="{ row }">
          <el-button type="primary" link @click="onEdit(row)">编辑</el-button>
          <el-button v-if="row.source === 'platform'" type="primary" link @click="onOverride(row)">覆盖</el-button>
        </template>
      </el-table-column>
    </el-table>

    <!-- 编辑弹窗 -->
    <el-dialog v-model="dialogVisible" :title="dialogTitle" width="640px" @closed="onDialogClosed">
      <el-form :model="form" label-width="100px" :rules="formRules" ref="formRef">
        <el-form-item label="类型">
          <el-input v-model="form.type" :disabled="!!form._id" placeholder="lesson_remind_1h / task_due ..." />
        </el-form-item>
        <el-form-item label="渠道">
          <el-select v-model="form.channel" :disabled="!!form._id" style="width: 100%">
            <el-option label="inbox (站内消息)" value="inbox" />
            <el-option label="wechatMini (微信小程序订阅)" value="wechatMini" disabled />
            <el-option label="sms (短信)" value="sms" disabled />
          </el-select>
        </el-form-item>
        <el-form-item label="标题" prop="title">
          <el-input v-model="form.title" maxlength="256" show-word-limit />
        </el-form-item>
        <el-form-item label="正文" prop="body">
          <el-input v-model="form.body" type="textarea" :rows="4" maxlength="1024" show-word-limit />
        </el-form-item>
        <el-form-item label="微信模板 ID">
          <el-input v-model="form.wechatTemplateId" placeholder="Phase 2 启用; 微信公众平台申请的模板 ID" disabled />
        </el-form-item>
        <el-form-item label="短信模板 Code">
          <el-input v-model="form.smsTemplateCode" placeholder="Phase 3 启用; 短信平台模板 code" disabled />
        </el-form-item>
        <el-form-item label="启用">
          <el-switch v-model="form.isActive" />
        </el-form-item>
        <el-form-item label="占位符">
          <div class="page-templates__placeholders">
            <el-tag v-for="p in placeholders" :key="p" size="small" effect="plain" style="margin: 2rpx 4rpx;">{{ p }}</el-tag>
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
import { ElMessage } from 'element-plus'
import { notificationApi } from '@/api/notification'

const PLACEHOLDERS = [
  '{studentName}', '{courseName}', '{time}', '{endTime}',
  '{room}', '{teacherName}', '{orgName}', '{orderNo}',
  '{amount}', '{points}', '{days}', '{reason}'
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
    filteredTemplates() {
      const kw = (this.filter.keyword || '').toLowerCase().trim()
      if (!kw) return this.templates
      return this.templates.filter((t) =>
        (t.type || '').toLowerCase().includes(kw) ||
        (t.title || '').toLowerCase().includes(kw)
      )
    },
    dialogTitle() {
      if (!this.form._id && this.form._fromPlatform) return '覆盖平台默认模板'
      if (!this.form._id) return '新建通知模板'
      return '编辑通知模板'
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
        this.templates = (data && data.items) || (Array.isArray(data) ? data : [])
      } catch (e) {
        ElMessage.error('加载失败')
      } finally {
        this.loading = false
      }
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
    onAdd() {
      this.resetForm()
      this.dialogVisible = true
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
    onOverride(row) {
      this.form = {
        _id: null,
        type: row.type,
        channel: row.channel,
        title: row.title,
        body: row.body,
        wechatTemplateId: row.wechatTemplateId || '',
        smsTemplateCode: row.smsTemplateCode || '',
        isActive: row.isActive !== false,
        _fromPlatform: true
      }
      this.dialogVisible = true
    },
    onToggleActive(row, v) {
      this.saving = true
      notificationApi.upsertTemplate(row.type, row.channel, {
        title: row.title,
        body: row.body,
        isActive: v
      }).then(() => {
        ElMessage.success(v ? '已启用' : '已停用')
        this.load()
      }).catch((e) => {
        ElMessage.error(e.message || '操作失败')
      }).finally(() => {
        this.saving = false
      })
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
          this.load()
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
  &__placeholders {
    line-height: 1.6;
  }
  &__hint {
    color: #909399;
    font-size: 12px;
    margin-top: 4px;
  }
}
</style>