DOGFOOD_APP_NAME := openidea_dogfood
DOGFOOD_BUNDLE_PATH := target/release/bundle/macos/$(DOGFOOD_APP_NAME).app
DOGFOOD_INSTALL_PATH := /Applications/$(DOGFOOD_APP_NAME).app
REMOTE_HOST ?= deng-devbox.coder
REMOTE_BUILD_DIR ?= /tmp/openidea-server-build
LOCAL_SERVER_DIR := $(HOME)/Library/Application Support/ai.l0ng.openidea/server/linux-x86_64

.PHONY: build_dogfood install_dogfood build_remote_server clean_remote_server

build_dogfood:
	node scripts/tauri.ts build --bundles app --config '{"productName":"$(DOGFOOD_APP_NAME)","build":{"beforeBuildCommand":"npm run build"},"bundle":{"createUpdaterArtifacts":false}}'

install_dogfood:
	@if [ ! -d "$(DOGFOOD_BUNDLE_PATH)" ]; then \
		$(MAKE) build_dogfood; \
	fi
	rm -rf "$(DOGFOOD_INSTALL_PATH)"
	cp -R "$(DOGFOOD_BUNDLE_PATH)" "$(DOGFOOD_INSTALL_PATH)"
	xattr -cr "$(DOGFOOD_INSTALL_PATH)"
	@echo "Installed $(DOGFOOD_APP_NAME) to $(DOGFOOD_INSTALL_PATH)"

build_remote_server:
	ssh $(REMOTE_HOST) "mkdir -p $(REMOTE_BUILD_DIR)"
	tar czf - Cargo.toml Cargo.lock crates languages java plugins sdk wit | ssh $(REMOTE_HOST) "tar xzf - -C $(REMOTE_BUILD_DIR)"
	ssh $(REMOTE_HOST) 'export PATH="$$HOME/.cargo/bin:$$PATH"; command -v cargo >/dev/null || (curl --proto "=https" --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --profile minimal); . "$$HOME/.cargo/env" 2>/dev/null || true; cd $(REMOTE_BUILD_DIR) && cargo build --release -p ide-host --bin openidea-server'
	mkdir -p "$(LOCAL_SERVER_DIR)"
	scp "$(REMOTE_HOST):$(REMOTE_BUILD_DIR)/target/release/openidea-server" "$(LOCAL_SERVER_DIR)/openidea-server"
	chmod 755 "$(LOCAL_SERVER_DIR)/openidea-server"
	@echo "Installed linux-x86_64 openidea-server override to $(LOCAL_SERVER_DIR)/openidea-server"

clean_remote_server:
	rm -f "$(LOCAL_SERVER_DIR)/openidea-server"
	@echo "Removed local linux-x86_64 openidea-server override"

