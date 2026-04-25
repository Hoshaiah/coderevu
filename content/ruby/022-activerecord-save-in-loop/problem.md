---
slug: activerecord-save-in-loop
track: ruby
orderIndex: 22
title: Save Inside Transaction Loop
difficulty: medium
tags:
  - active-record
  - performance
  - n+1
language: ruby
---

## Context

This service object lives in `app/services/bulk_tag_service.rb` and is called from an admin controller action that applies a set of tags to every article in a given category. The app runs on Rails 7 with PostgreSQL. The service is expected to handle categories with up to 10,000 articles during a content migration.

The admin team reported that clicking "Apply Tags" on large categories causes a request timeout (60-second Heroku limit). For a category with 8,000 articles, the operation takes over 3 minutes in staging. Database CPU spikes to 100% and the slow query log shows thousands of individual `UPDATE articles` statements.

The developer confirmed the logic is correct (tags are applied accurately on small datasets) and ruled out missing indexes — the `articles.category_id` index is present.

## Buggy code

```ruby
class BulkTagService
  def initialize(category_id, tag_ids)
    @category_id = category_id
    @tag_ids = tag_ids
  end

  def call
    articles = Article.where(category_id: @category_id)

    Article.transaction do
      articles.each do |article|
        article.tag_ids = @tag_ids
        article.save!
      end
    end

    { updated: articles.count }
  end
end
```
