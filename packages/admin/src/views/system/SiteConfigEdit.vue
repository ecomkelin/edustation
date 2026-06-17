<template>
  <div class="page">
    <h2>站点配置</h2>
    <p class="subtitle">
      备案号、版权年份、运营主体、客服电话等平台级信息。这里改动后,管理后台与客户端的 Footer
      (备案号、版权)以及客户端"我的"页底部会立刻同步(用户刷新页面后生效)。
    </p>

    <el-alert
      type="warning"
      :closable="false"
      title="仅平台超管可改"
      description="此页面属于平台层面配置,所有机构、所有用户共用一份。本页所有修改通过后端 requirePlatformAdmin 中间件硬卡。"
      show-icon
      class="mb"
    />

    <el-card v-loading="loading">
      <el-form ref="formRef" :model="form" :rules="rules" label-width="140px" label-position="left">
        <el-divider content-position="left">版权与运营主体</el-divider>
        <el-row :gutter="16">
          <el-col :span="6">
            <el-form-item label="版权年份" prop="copyrightYear">
              <el-input v-model="form.copyrightYear" placeholder="2026" />
            </el-form-item>
          </el-col>
          <el-col :span="18">
            <el-form-item label="运营主体名称" prop="operatorName">
              <el-input v-model="form.operatorName" placeholder="上海某教育科技有限公司" />
            </el-form-item>
          </el-col>
        </el-row>
        <el-form-item label="运营主体地址" prop="operatorAddress">
          <el-input v-model="form.operatorAddress" placeholder="详细注册地址" />
        </el-form-item>
        <el-form-item label="运营主体联系方式" prop="operatorContact">
          <el-input v-model="form.operatorContact" placeholder="电话或邮箱" />
        </el-form-item>

        <el-divider content-position="left">合规备案号</el-divider>
        <el-form-item label="ICP 备案号" prop="icpNumber">
          <el-input v-model="form.icpNumber" placeholder="例:沪ICP备 0000000号" />
          <div class="form-hint">前端 Footer 会自动链到 <code>https://beian.miit.gov.cn</code> (工信部硬要求)</div>
        </el-form-item>
        <el-form-item label="公安网安备案号" prop="policeBeianNumber">
          <el-input v-model="form.policeBeianNumber" placeholder="例:沪公网安备 00000000000000号" />
        </el-form-item>

        <el-divider content-position="left">客服与平台 logo</el-divider>
        <el-form-item label="客服 / 投诉电话" prop="customerServicePhone">
          <el-input v-model="form.customerServicePhone" placeholder="《电子商务法》第 15 条要求显著告知" />
        </el-form-item>
        <!-- 平台 logo 上传暂留 placeholder, FilePicker 接入待 PR3 复用相同组件 -->
        <el-form-item label="平台 logo">
          <div class="muted">阶段 2 实现 (FilePicker 组件接入)</div>
        </el-form-item>

        <el-form-item>
          <el-button type="primary" :loading="submitting" @click="submit">保存</el-button>
          <el-button @click="load">重置</el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <el-card class="mt preview-card">
      <template #header><b>Footer 预览</b></template>
      <div class="preview-footer">
        <div>{{ siteConfig.copyrightLine }}</div>
        <div v-if="form.customerServicePhone" class="muted">客服 / 投诉:{{ form.customerServicePhone }}</div>
      </div>
    </el-card>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { siteConfigApi } from '@/api/siteConfig'
import { useSiteConfigStore } from '@/stores/siteConfig'

const siteConfig = useSiteConfigStore()
const formRef = ref()
const loading = ref(false)
const submitting = ref(false)

const form = reactive({
  copyrightYear: '',
  operatorName: '',
  operatorAddress: '',
  operatorContact: '',
  icpNumber: '',
  policeBeianNumber: '',
  customerServicePhone: ''
})

const rules = {
  copyrightYear: [{ max: 10, message: '≤ 10 字', trigger: 'blur' }],
  operatorName: [{ max: 100, message: '≤ 100 字', trigger: 'blur' }]
}

async function load() {
  loading.value = true
  try {
    const res = await siteConfigApi.get()
    Object.assign(form, res.data || {})
  } finally {
    loading.value = false
  }
}

async function submit() {
  if (!formRef.value) return
  try {
    await formRef.value.validate()
  } catch (_) {
    return
  }
  submitting.value = true
  try {
    await siteConfig.update({
      copyrightYear: form.copyrightYear,
      operatorName: form.operatorName,
      operatorAddress: form.operatorAddress,
      operatorContact: form.operatorContact,
      icpNumber: form.icpNumber,
      policeBeianNumber: form.policeBeianNumber,
      customerServicePhone: form.customerServicePhone
    })
    ElMessage.success('已保存,Footer 已实时更新')
  } finally {
    submitting.value = false
  }
}

onMounted(load)
</script>

<style scoped>
.page { padding: 8px; }
.subtitle { color: #909399; margin: 0 0 16px; font-size: 13px; line-height: 1.6; }
.mb { margin-bottom: 16px; }
.mt { margin-top: 16px; }
.form-hint { color: #909399; font-size: 12px; margin-top: 4px; }
.form-hint code {
  padding: 1px 6px;
  background: #f5f7fa;
  border-radius: 3px;
  font-size: 12px;
  color: #c7254e;
}
.muted { color: #909399; }
.preview-card { background: #fafafa; }
.preview-footer {
  padding: 16px;
  background: #fff;
  border: 1px dashed #ebeef5;
  border-radius: 4px;
  text-align: center;
  font-size: 12px;
  color: #606266;
  line-height: 1.8;
}
</style>
