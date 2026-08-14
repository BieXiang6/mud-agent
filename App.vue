<script>
	import { state, applyThemeMode } from '@/utils/store.js'
	import { acquireBackgroundConnectionLocks, releaseBackgroundConnectionLocks } from '@/utils/backgroundConnection.js'
	import { runtime } from '@/utils/platform/index.js'

	export default {
		onLaunch: function() {
			console.log('App Launch')
			applyThemeMode()
			this.setKeepAwake(true)
		},
		onShow: function() {
			console.log('App Show')
			applyThemeMode()
			releaseBackgroundConnectionLocks()
			this.setKeepAwake(true)
		},
		onHide: function() {
			console.log('App Hide')
			this.setKeepAwake(false)
			if (state.connected) acquireBackgroundConnectionLocks()
		},
		methods: {
			setKeepAwake(enabled) {
				runtime.setWakeLock(enabled)
			}
		}
	}
</script>

<style>
	/* 全局暗色风格 */
	page {
		height: 100%;
		overflow: hidden;
		overscroll-behavior: none;
		background-color: var(--app-background, #000000);
		color: var(--app-text, #dddddd);
		font-size: 28rpx;
		line-height: var(--app-line-height, 1.5);
	}
	.page {
		width: 100%;
		max-width: var(--app-content-max-width, none);
		margin-left: auto;
		margin-right: auto;
		background-color: var(--app-background, #0c0f12) !important;
		color: var(--app-text, #edf1f4) !important;
		font-family: var(--app-font-family, system-ui, sans-serif);
		font-size: calc(28rpx + var(--app-font-size-offset, 0rpx));
		line-height: var(--app-line-height, 1.5);
	}
	.page .topbar,
	.page .nav,
	.page .tbar,
	.page .menu,
	.page .ai-panel-head,
	.page .quick-panel-head,
	.gd-panel .gd-head {
		background-color: var(--app-header-background-color, var(--app-surface-raised-alpha)) !important;
		background-image: var(--app-header-background-image, none) !important;
		background-size: var(--app-header-background-size, cover);
		background-position: var(--app-header-background-position, center);
		background-repeat: var(--app-header-background-repeat, no-repeat);
		background-attachment: var(--app-header-background-attachment, scroll);
		border-color: var(--app-border) !important;
		backdrop-filter: blur(var(--app-backdrop-blur, 0));
	}
	.page .card,
	.page .chat,
	.page .mycmds,
	.page .profiles,
	.page .form,
	.page .skill-row,
	.page .account-card,
	.page .step,
	.page .config-list,
	.page .ai-panel,
	.page .quick-panel,
	.page .ai-turn,
	.page .ai-answer,
	.page .ai-task,
	.page .ai-flow,
	.page .notice,
	.page .intro,
	.page .guide-link,
	.page .security,
	.page .announcement-dialog,
	.page .help-dialog,
	.page .ai-panel-tools,
	.page .ai-task-drawer,
	.page .ai-conversation,
	.page .ai-composer,
	.page .hps,
	.page .hp-cell,
	.gd-panel {
		background-color: var(--app-panel-background-color, var(--app-surface-alpha)) !important;
		background-image: var(--app-panel-background-image, none) !important;
		background-size: var(--app-panel-background-size, cover);
		background-position: var(--app-panel-background-position, center);
		background-repeat: var(--app-panel-background-repeat, no-repeat);
		background-attachment: var(--app-panel-background-attachment, scroll);
		border-color: var(--app-border) !important;
		border-width: var(--app-border-width, 1rpx) !important;
		border-radius: var(--app-radius-medium, 6rpx) !important;
		box-shadow: var(--app-shadow, none);
		backdrop-filter: blur(var(--app-backdrop-blur, 0));
	}
	/* 具名区块只在对应背景槽被配置时生成变量；否则完整继承通用 panel 背景。 */
	.page .chat {
		background: var(--app-chat-background-image, var(--app-panel-background-image)) var(--app-chat-background-position, var(--app-panel-background-position)) / var(--app-chat-background-size, var(--app-panel-background-size)) var(--app-chat-background-repeat, var(--app-panel-background-repeat)) var(--app-chat-background-attachment, var(--app-panel-background-attachment)) var(--app-chat-background-color, var(--app-panel-background-color)) !important;
	}
	.page .mycmds {
		background: var(--app-command-panel-background-image, var(--app-panel-background-image)) var(--app-command-panel-background-position, var(--app-panel-background-position)) / var(--app-command-panel-background-size, var(--app-panel-background-size)) var(--app-command-panel-background-repeat, var(--app-panel-background-repeat)) var(--app-command-panel-background-attachment, var(--app-panel-background-attachment)) var(--app-command-panel-background-color, var(--app-panel-background-color)) !important;
	}
	.page .profiles {
		background: var(--app-profiles-background-image, var(--app-panel-background-image)) var(--app-profiles-background-position, var(--app-panel-background-position)) / var(--app-profiles-background-size, var(--app-panel-background-size)) var(--app-profiles-background-repeat, var(--app-panel-background-repeat)) var(--app-profiles-background-attachment, var(--app-panel-background-attachment)) var(--app-profiles-background-color, var(--app-panel-background-color)) !important;
	}
	.page .form {
		background: var(--app-form-background-image, var(--app-panel-background-image)) var(--app-form-background-position, var(--app-panel-background-position)) / var(--app-form-background-size, var(--app-panel-background-size)) var(--app-form-background-repeat, var(--app-panel-background-repeat)) var(--app-form-background-attachment, var(--app-panel-background-attachment)) var(--app-form-background-color, var(--app-panel-background-color)) !important;
	}
	.page .skill-row {
		background: var(--app-skill-list-background-image, var(--app-panel-background-image)) var(--app-skill-list-background-position, var(--app-panel-background-position)) / var(--app-skill-list-background-size, var(--app-panel-background-size)) var(--app-skill-list-background-repeat, var(--app-panel-background-repeat)) var(--app-skill-list-background-attachment, var(--app-panel-background-attachment)) var(--app-skill-list-background-color, var(--app-panel-background-color)) !important;
	}
	.page .account-card {
		background: var(--app-account-card-background-image, var(--app-panel-background-image)) var(--app-account-card-background-position, var(--app-panel-background-position)) / var(--app-account-card-background-size, var(--app-panel-background-size)) var(--app-account-card-background-repeat, var(--app-panel-background-repeat)) var(--app-account-card-background-attachment, var(--app-panel-background-attachment)) var(--app-account-card-background-color, var(--app-panel-background-color)) !important;
	}
	.page .ai-panel {
		background: var(--app-ai-panel-background-image, var(--app-panel-background-image)) var(--app-ai-panel-background-position, var(--app-panel-background-position)) / var(--app-ai-panel-background-size, var(--app-panel-background-size)) var(--app-ai-panel-background-repeat, var(--app-panel-background-repeat)) var(--app-ai-panel-background-attachment, var(--app-panel-background-attachment)) var(--app-ai-panel-background-color, var(--app-panel-background-color)) !important;
	}
	.page .quick-panel {
		background: var(--app-quick-panel-background-image, var(--app-panel-background-image)) var(--app-quick-panel-background-position, var(--app-panel-background-position)) / var(--app-quick-panel-background-size, var(--app-panel-background-size)) var(--app-quick-panel-background-repeat, var(--app-panel-background-repeat)) var(--app-quick-panel-background-attachment, var(--app-panel-background-attachment)) var(--app-quick-panel-background-color, var(--app-panel-background-color)) !important;
	}
	.page .ai-turn,
	.page .ai-answer,
	.page .ai-task,
	.page .ai-flow {
		background: var(--app-ai-content-background-image, var(--app-panel-background-image)) var(--app-ai-content-background-position, var(--app-panel-background-position)) / var(--app-ai-content-background-size, var(--app-panel-background-size)) var(--app-ai-content-background-repeat, var(--app-panel-background-repeat)) var(--app-ai-content-background-attachment, var(--app-panel-background-attachment)) var(--app-ai-content-background-color, var(--app-panel-background-color)) !important;
	}
	.page .notice {
		background: var(--app-notice-background-image, var(--app-panel-background-image)) var(--app-notice-background-position, var(--app-panel-background-position)) / var(--app-notice-background-size, var(--app-panel-background-size)) var(--app-notice-background-repeat, var(--app-panel-background-repeat)) var(--app-notice-background-attachment, var(--app-panel-background-attachment)) var(--app-notice-background-color, var(--app-panel-background-color)) !important;
	}
	.page .intro {
		background: var(--app-intro-background-image, var(--app-panel-background-image)) var(--app-intro-background-position, var(--app-panel-background-position)) / var(--app-intro-background-size, var(--app-panel-background-size)) var(--app-intro-background-repeat, var(--app-panel-background-repeat)) var(--app-intro-background-attachment, var(--app-panel-background-attachment)) var(--app-intro-background-color, var(--app-panel-background-color)) !important;
	}
	.page .guide-link {
		background: var(--app-guide-background-image, var(--app-panel-background-image)) var(--app-guide-background-position, var(--app-panel-background-position)) / var(--app-guide-background-size, var(--app-panel-background-size)) var(--app-guide-background-repeat, var(--app-panel-background-repeat)) var(--app-guide-background-attachment, var(--app-panel-background-attachment)) var(--app-guide-background-color, var(--app-panel-background-color)) !important;
	}
	.page .security {
		background: var(--app-security-background-image, var(--app-panel-background-image)) var(--app-security-background-position, var(--app-panel-background-position)) / var(--app-security-background-size, var(--app-panel-background-size)) var(--app-security-background-repeat, var(--app-panel-background-repeat)) var(--app-security-background-attachment, var(--app-panel-background-attachment)) var(--app-security-background-color, var(--app-panel-background-color)) !important;
	}
	.page .announcement-dialog {
		background: var(--app-announcement-dialog-background-image, var(--app-panel-background-image)) var(--app-announcement-dialog-background-position, var(--app-panel-background-position)) / var(--app-announcement-dialog-background-size, var(--app-panel-background-size)) var(--app-announcement-dialog-background-repeat, var(--app-panel-background-repeat)) var(--app-announcement-dialog-background-attachment, var(--app-panel-background-attachment)) var(--app-announcement-dialog-background-color, var(--app-panel-background-color)) !important;
	}
	.page .help-dialog {
		background: var(--app-help-dialog-background-image, var(--app-panel-background-image)) var(--app-help-dialog-background-position, var(--app-panel-background-position)) / var(--app-help-dialog-background-size, var(--app-panel-background-size)) var(--app-help-dialog-background-repeat, var(--app-panel-background-repeat)) var(--app-help-dialog-background-attachment, var(--app-panel-background-attachment)) var(--app-help-dialog-background-color, var(--app-panel-background-color)) !important;
	}
	.page .ai-panel-tools {
		background: var(--app-ai-tools-background-image, var(--app-panel-background-image)) var(--app-ai-tools-background-position, var(--app-panel-background-position)) / var(--app-ai-tools-background-size, var(--app-panel-background-size)) var(--app-ai-tools-background-repeat, var(--app-panel-background-repeat)) var(--app-ai-tools-background-attachment, var(--app-panel-background-attachment)) var(--app-ai-tools-background-color, var(--app-panel-background-color)) !important;
	}
	.page .ai-task-drawer {
		background: var(--app-ai-task-drawer-background-image, var(--app-panel-background-image)) var(--app-ai-task-drawer-background-position, var(--app-panel-background-position)) / var(--app-ai-task-drawer-background-size, var(--app-panel-background-size)) var(--app-ai-task-drawer-background-repeat, var(--app-panel-background-repeat)) var(--app-ai-task-drawer-background-attachment, var(--app-panel-background-attachment)) var(--app-ai-task-drawer-background-color, var(--app-panel-background-color)) !important;
	}
	.page .ai-conversation {
		background: var(--app-ai-conversation-background-image, var(--app-panel-background-image)) var(--app-ai-conversation-background-position, var(--app-panel-background-position)) / var(--app-ai-conversation-background-size, var(--app-panel-background-size)) var(--app-ai-conversation-background-repeat, var(--app-panel-background-repeat)) var(--app-ai-conversation-background-attachment, var(--app-panel-background-attachment)) var(--app-ai-conversation-background-color, var(--app-panel-background-color)) !important;
	}
	.page .ai-composer {
		background: var(--app-ai-composer-background-image, var(--app-panel-background-image)) var(--app-ai-composer-background-position, var(--app-panel-background-position)) / var(--app-ai-composer-background-size, var(--app-panel-background-size)) var(--app-ai-composer-background-repeat, var(--app-panel-background-repeat)) var(--app-ai-composer-background-attachment, var(--app-panel-background-attachment)) var(--app-ai-composer-background-color, var(--app-panel-background-color)) !important;
	}
	.page .hps,
	.page .hp-cell {
		background: var(--app-status-panel-background-image, var(--app-panel-background-image)) var(--app-status-panel-background-position, var(--app-panel-background-position)) / var(--app-status-panel-background-size, var(--app-panel-background-size)) var(--app-status-panel-background-repeat, var(--app-panel-background-repeat)) var(--app-status-panel-background-attachment, var(--app-panel-background-attachment)) var(--app-status-panel-background-color, var(--app-panel-background-color)) !important;
	}
	.gd-panel {
		background-color: var(--app-dialog-background-color, var(--app-surface-alpha)) !important;
		background-image: var(--app-dialog-background-image, none) !important;
		background-size: var(--app-dialog-background-size, cover);
		background-position: var(--app-dialog-background-position, center);
		background-repeat: var(--app-dialog-background-repeat, no-repeat);
		background-attachment: var(--app-dialog-background-attachment, scroll);
	}
	/* 特殊组件保留产品默认外观；仅在相关字段被定制后切换为主题变量。 */
	.page .ai-finished {
		background-color: var(--app-ai-summary-background-color) !important;
		background-image: var(--app-ai-summary-background-image) !important;
		background-size: var(--app-ai-summary-background-size);
		background-position: var(--app-ai-summary-background-position);
		background-repeat: var(--app-ai-summary-background-repeat);
		border-color: var(--app-ai-summary-border-color) !important;
		border-width: var(--app-ai-summary-border-width) !important;
		border-radius: var(--app-ai-summary-radius) !important;
		box-shadow: var(--app-ai-summary-shadow);
	}
	.page .ai-finished-summary {
		color: var(--app-ai-summary-text) !important;
	}
	.page .quick-fab {
		background-color: var(--app-quick-entry-background-color) !important;
		background-image: var(--app-quick-entry-background-image) !important;
		background-size: var(--app-quick-entry-background-size);
		background-position: var(--app-quick-entry-background-position);
		background-repeat: var(--app-quick-entry-background-repeat);
		border-color: var(--app-quick-entry-border-color) !important;
		border-width: var(--app-quick-entry-border-width) !important;
		border-radius: var(--app-quick-entry-radius) !important;
		box-shadow: var(--app-quick-entry-shadow);
		color: var(--app-quick-entry-text) !important;
	}
	.page .chat,
	.page .mycmds {
		box-shadow: none;
		border-radius: 0 !important;
	}
	.page .input,
	.page .in,
	.page .source,
	.page .ai-composer textarea,
	.gd-panel textarea,
	.gd-panel input {
		background-color: var(--app-input-background-color, var(--app-input-background)) !important;
		background-image: var(--app-input-background-image, none) !important;
		background-size: var(--app-input-background-size, cover);
		background-position: var(--app-input-background-position, center);
		background-repeat: var(--app-input-background-repeat, no-repeat);
		background-attachment: var(--app-input-background-attachment, scroll);
		border-color: var(--app-border) !important;
		border-width: var(--app-border-width, 1rpx) !important;
		border-radius: var(--app-radius-small, 2rpx) !important;
		color: var(--app-text) !important;
		font-family: var(--app-font-family, inherit);
		min-height: var(--app-control-height, 58rpx);
	}
	.page .button,
	.page .import-button,
	.page .login-btn,
	.page .lost-btn,
	.page .ai-action.primary,
	.gd-panel .gd-submit,
	.gd-panel .gd-confirm-btn {
		background-color: var(--app-primary-button-background-color, var(--app-primary)) !important;
		background-image: var(--app-primary-button-background-image, none) !important;
		background-size: var(--app-primary-button-background-size, cover);
		background-position: var(--app-primary-button-background-position, center);
		background-repeat: var(--app-primary-button-background-repeat, no-repeat);
		background-attachment: var(--app-primary-button-background-attachment, scroll);
		border-color: var(--app-primary-hover) !important;
		border-width: var(--app-border-width, 1rpx) !important;
		border-radius: var(--app-radius-small, 2rpx) !important;
		color: var(--app-primary-contrast) !important;
		min-height: var(--app-control-height, 58rpx);
	}
	.page .ai-actions .ai-action {
		min-height: var(--app-control-height, 58rpx);
	}
	.page .tm-btn,
	.page .obj-btn,
	.page .act-btn,
	.page .dir-btn,
	.page .menu-btn,
	.page .mycmds-btn,
	.gd-panel .gd-btn,
	.gd-panel .gd-conf-btn {
		background-color: var(--app-secondary-button-background-color, var(--app-surface-muted)) !important;
		background-image: var(--app-secondary-button-background-image, none) !important;
		background-size: var(--app-secondary-button-background-size, cover);
		background-position: var(--app-secondary-button-background-position, center);
		background-repeat: var(--app-secondary-button-background-repeat, no-repeat);
		background-attachment: var(--app-secondary-button-background-attachment, scroll);
		border-color: var(--app-border) !important;
		border-width: var(--app-border-width, 1rpx) !important;
		border-radius: var(--app-radius-small, 2rpx) !important;
		color: var(--app-text) !important;
	}
	.page .button-row,
	.page .server-row,
	.page .ai-actions,
	.page .ai-panel-actions,
	.page .quick-panel-grid {
		gap: var(--app-density-gap, 12rpx) !important;
	}
	.gd-mask,
	.announcement-mask,
	.help-mask {
		background-color: var(--app-overlay) !important;
	}
	.page .ai-tool-data,
	.page .ai-thinking,
	.page .ai-tool,
	.page .url {
		background-color: var(--app-code-background) !important;
	}
	.page .body,
	.page .content {
		padding-left: var(--app-page-padding, 18rpx);
		padding-right: var(--app-page-padding, 18rpx);
	}
	.page.ai-guide-page .body {
		padding-left: 0 !important;
		padding-right: 0 !important;
	}
	.page .profile-meta,
	.page .profile-name,
	.page .skill-description,
	.page .skill-name,
	.page .subtitle,
	.page .captcha,
	.page .server,
	.page .paragraph,
	.page .intro-text,
	.page .ai-empty,
	.page .ai-context,
	.page .ai-task-time,
	.page .ai-thinking-meta,
	.page .ai-thinking-page-state,
	.page .ai-tool-data,
	.page .ai-tool-running,
	.page .lost-t,
	.page .guide-desc,
	.page .help-text,
	.page .announcement-date {
		color: var(--app-text-muted) !important;
	}
	.page .count,
	.page .section-title,
	.page .settings,
	.page .add,
	.page .edit,
	.page .help-link,
	.page .long-more,
	.page .ai-status,
	.page .ai-turn-role,
	.page .ai-panel-tool,
	.page .ai-task-new,
	.page .ai-expand-icon,
	.page .ai-thinking-page-btn,
	.page .ai-tool-name,
	.page .usage-index,
	.page .copy,
	.page .choose {
		color: var(--app-primary) !important;
	}
	.page .here,
	.page .chat-line,
	.page .long-line,
	.page .out-line,
	.page .dir-center,
	.page .menu-btn,
	.page .quick-panel-title,
	.page .quick-panel-close,
	.page .ai-panel-title,
	.page .ai-close,
	.page .ai-task-title,
	.page .ai-turn-text,
	.page .ai-answer,
	.page .lost-title,
	.page .question,
	.page .config-value,
	.page .announcement-title,
	.page .announcement-content,
	.page .help-title,
	.page .help-step-title {
		color: var(--app-text) !important;
	}
	.page .long-wrap,
	.page .mleft,
	.page .exits,
	.page .profile-row,
	.page .config-row,
	.page .ai-close,
	.page .ai-action,
	.page .ai-task-list-head,
	.page .ai-task-row,
	.page .ai-flow-item,
	.page .ai-tool-result,
	.page .ai-thinking-pager,
	.page .quick-panel-close,
	.page .menu-btn,
	.page .help-step,
	.page .help-examples {
		border-color: var(--app-border) !important;
	}
	.page .profile-row.selected,
	.page .ai-task-row.active,
	.page .ai-turn.user {
		background-color: var(--app-primary-soft) !important;
	}
	.page .ai-tool.error,
	.page .notice.danger {
		background-color: var(--app-danger-soft) !important;
	}
	.page .hr-line,
	.page .foot-rule,
	.page .obj-bar,
	.page .hp-track {
		background-color: var(--app-border) !important;
	}
	.page .error,
	.page .danger,
	.gd-panel .danger {
		color: var(--app-danger) !important;
	}
	/* 各页面通用公共样式 */
	view, text {
		box-sizing: border-box;
	}
	/* 全局按钮点击反馈 (配合 hover-class="hp" 使用) */
	.hp {
		background-color: var(--app-primary-soft, rgba(255, 255, 255, 0.18)) !important;
		opacity: 0.85;
	}
	.light .hp {
		background-color: var(--app-primary-soft, rgba(75, 85, 76, 0.16)) !important;
	}

	/* Electron 专用细滚动条；移动端没有 electron-runtime 标记，不受影响。 */
	html.electron-runtime,
	html.electron-runtime * {
		scrollbar-width: thin;
		scrollbar-color: var(--app-surface-muted, #4b5962) transparent;
	}
	html.electron-runtime ::-webkit-scrollbar {
		width: 5px;
		height: 5px;
	}
	html.electron-runtime ::-webkit-scrollbar-track {
		background: transparent;
	}
	html.electron-runtime ::-webkit-scrollbar-thumb {
		min-height: 28px;
		border-radius: 5px;
		background: var(--app-surface-muted, #4b5962);
	}
	html.electron-runtime ::-webkit-scrollbar-thumb:hover {
		background: var(--app-primary-hover, #657681);
	}
	html.electron-runtime ::-webkit-scrollbar-corner {
		background: transparent;
	}
</style>
