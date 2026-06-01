require 'json'

Pod::Spec.new do |s|
  s.name         = 'BeautyFilter'
  s.version      = '1.0.0'
  s.summary      = 'Native beauty filter for LiveKit WebRTC video frames'
  s.license      = 'MIT'
  s.authors      = { 'Migme' => 'dev@migme.com' }
  s.homepage     = 'https://github.com/migme/migme'
  s.platforms    = { :ios => '15.0' }

  s.source       = { :path => '.' }
  s.source_files = '*.{h,m,mm}'

  s.dependency 'React-Core'
  s.dependency 'RCTWebRTC'
end
