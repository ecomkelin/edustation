<!--
  常见问题 - FAQ
-->
<template>
  <view class="faq">
    <view class="faq__list">
      <view
        v-for="(item, i) in faqs"
        :key="i"
        class="faq__item"
      >
        <view class="faq__item-q" @tap="toggle(i)">
          <text class="faq__item-q-text">{{ item.q }}</text>
          <text class="faq__item-arrow" :class="{ 'faq__item-arrow--open': item.open }">›</text>
        </view>
        <view v-if="item.open" class="faq__item-a">
          <text>{{ item.a }}</text>
        </view>
      </view>
    </view>
  </view>
</template>

<script>
export default {
  data() {
    return {
      faqs: [
        {
          q: '初始密码是什么?',
          a: '新家长账号的初始密码是手机号后 6 位。首次登录后系统会要求您修改密码,以保障账号安全。',
          open: true
        },
        {
          q: '怎么切换孩子?',
          a: '在首页顶部或「我的」页都能看到当前孩子的头像,点击它即可切换。多孩子的家庭可随时查看每个孩子的独立课表。',
          open: false
        },
        {
          q: '忘记密码怎么办?',
          a: '请联系孩子的任课老师或机构教务,他们可以在管理后台帮您重置密码。',
          open: false
        },
        {
          q: '宠物怎么喂?',
          a: '进入「宠物」Tab,点击「喂食」按钮,选择喜欢的食物即可。喂食会消耗积分,也会增加宠物经验和饱腹度。',
          open: false
        },
        {
          q: '积分有什么用?',
          a: '积分可以喂宠物、买装饰、买食物,以后还会接入更多兑换场景。出勤、分享、购课都能赚积分。',
          open: false
        },
        {
          q: '怎么接送孩子?',
          a: '在「我的」-「接送授权」中,可以添加爷爷奶奶等接送人,人脸识别后他们也能接送孩子。',
          open: false
        },
        {
          q: '课程冲突了怎么办?',
          a: '请联系教务老师,他们可以协助您调整开班或分班。系统会自动检测冲突。',
          open: false
        },
        {
          q: '退款多久到账?',
          a: '退款申请提交后,1-3 个工作日内审核完成,原路返回到您的支付账户。',
          open: false
        }
      ]
    }
  },
  methods: {
    toggle(i) {
      this.faqs[i].open = !this.faqs[i].open
    }
  }
}
</script>

<style lang="scss" scoped>
.faq {
  min-height: 100vh;
  background: $bg-page;
  padding: $spacing-md;

  &__list {
    display: flex;
    flex-direction: column;
    gap: $spacing-sm;
  }

  &__item {
    background: $bg-card;
    border-radius: $radius-md;
    box-shadow: $shadow-card;
    overflow: hidden;
  }

  &__item-q {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: $spacing-md;
  }

  &__item-q-text {
    flex: 1;
    font-size: $font-base;
    font-weight: $font-weight-medium;
    color: $text-primary;
  }

  &__item-arrow {
    font-size: 36rpx;
    color: $text-tertiary;
    transform: rotate(90deg);
    transition: transform $transition-fast;

    &--open {
      transform: rotate(-90deg);
    }
  }

  &__item-a {
    padding: 0 $spacing-md $spacing-md;
    font-size: $font-sm;
    color: $text-secondary;
    line-height: 1.7;
  }
}
</style>