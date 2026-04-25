---
slug: file-upload-path-traversal
track: ruby
orderIndex: 68
title: File Upload Path Traversal Via Filenames
difficulty: hard
tags:
  - security
  - path-traversal
  - file-upload
language: ruby
---

## Context

The app lets users upload profile avatars. The controller saves the file to disk under `public/uploads/avatars/`. A security audit found that sending a filename like `../../config/database.yml` allows overwriting arbitrary files on the server, including application configuration and source code.

The upload controller is shown below.

## Buggy code

```ruby
# app/controllers/avatars_controller.rb
class AvatarsController < ApplicationController
  UPLOAD_DIR = Rails.root.join('public', 'uploads', 'avatars')

  def update
    uploaded = params[:avatar]
    unless uploaded.content_type.start_with?('image/')
      return render json: { error: 'Must be an image' }, status: :unprocessable_entity
    end

    filename = uploaded.original_filename
    dest     = UPLOAD_DIR.join(filename)
    FileUtils.mkdir_p(UPLOAD_DIR)
    File.binwrite(dest, uploaded.read)

    current_user.update!(avatar_path: "uploads/avatars/#{filename}")
    render json: { url: "/uploads/avatars/#{filename}" }
  end
end
```
