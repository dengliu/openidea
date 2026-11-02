DOGFOOD_APP_NAME := openidea_dogfood
DOGFOOD_BUNDLE_PATH := target/release/bundle/macos/$(DOGFOOD_APP_NAME).app
DOGFOOD_INSTALL_PATH := /Applications/$(DOGFOOD_APP_NAME).app

.PHONY: build_dogfood install_dogfood

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
