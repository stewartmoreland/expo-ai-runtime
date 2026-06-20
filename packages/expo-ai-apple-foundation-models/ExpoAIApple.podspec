require 'json'

package = JSON.parse(File.read(File.join(__dir__, 'package.json')))

Pod::Spec.new do |s|
  s.name           = 'ExpoAIApple'
  s.version        = package['version']
  s.summary        = package['description']
  s.description    = package['description']
  s.license        = package['license']
  s.author         = package['author']
  s.homepage       = 'https://github.com/stewmore/expo-ai-runtime'
  s.platforms      = {
    :ios => '15.1',
    :tvos => '15.1'
  }
  s.swift_version  = '5.9'
  s.source         = { git: 'https://github.com/stewmore/expo-ai-runtime' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  # The FoundationModels framework only exists on iOS 26+; all usage in Swift is
  # gated behind `if #available(iOS 26.0, *)`, so the pod still links on older
  # deployment targets. It is weak-linked so the binary loads on older OSes.
  s.weak_frameworks = 'FoundationModels'

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule'
  }

  s.source_files = 'ios/**/*.{h,m,mm,swift,hpp,cpp}'
end
