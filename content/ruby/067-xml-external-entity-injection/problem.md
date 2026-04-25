---
slug: xml-external-entity-injection
track: ruby
orderIndex: 67
title: XXE Injection In XML Import Endpoint
difficulty: hard
tags:
  - security
  - xxe
  - xml-parsing
language: ruby
---

## Context

The app accepts XML product catalog uploads from partner integrations. A penetration test flagged the import endpoint as vulnerable to XML External Entity (XXE) injection, allowing an attacker to read arbitrary files from the server (e.g., `/etc/passwd`) or trigger server-side request forgery.

The relevant controller and parsing code are shown below.

## Buggy code

```ruby
# app/controllers/api/imports_controller.rb
class Api::ImportsController < ApplicationController
  skip_before_action :verify_authenticity_token
  before_action :require_api_key

  def create
    xml_data = request.body.read
    doc = Nokogiri::XML(xml_data)

    doc.xpath('//product').each do |node|
      Product.create!(
        sku:   node.at_xpath('sku')&.text,
        name:  node.at_xpath('name')&.text,
        price: node.at_xpath('price')&.text&.to_d
      )
    end

    render json: { imported: doc.xpath('//product').count }, status: :created
  rescue Nokogiri::XML::SyntaxError => e
    render json: { error: e.message }, status: :unprocessable_entity
  end
end
```
