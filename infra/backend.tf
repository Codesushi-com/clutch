terraform {
  backend "s3" {
    bucket         = "dan-tf-state-personal"
    key            = "projects/clutch/terraform.tfstate"
    region         = "us-west-1"
    dynamodb_table = "tf-state-locks"
    profile        = "personal"
  }
}
