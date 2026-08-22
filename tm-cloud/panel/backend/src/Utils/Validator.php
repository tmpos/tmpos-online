<?php

namespace TMCloud\Utils;

class Validator
{
    public static function validate(array $data, array $rules): array
    {
        $errors = [];

        foreach ($rules as $field => $ruleString) {
            $fieldRules = explode('|', $ruleString);

            foreach ($fieldRules as $rule) {
                $ruleParts = explode(':', $rule);
                $ruleName = $ruleParts[0];
                $ruleValue = $ruleParts[1] ?? null;

                $error = self::applyRule($field, $data[$field] ?? null, $ruleName, $ruleValue);

                if ($error) {
                    $errors[$field][] = $error;
                }
            }
        }

        return $errors;
    }

    private static function applyRule(string $field, $value, string $rule, $ruleValue): ?string
    {
        switch ($rule) {
            case 'required':
                if (empty($value)) {
                    return "$field is required";
                }
                break;

            case 'min':
                if (strlen($value) < $ruleValue) {
                    return "$field must be at least $ruleValue characters";
                }
                break;

            case 'max':
                if (strlen($value) > $ruleValue) {
                    return "$field must not exceed $ruleValue characters";
                }
                break;

            case 'email':
                if (!filter_var($value, FILTER_VALIDATE_EMAIL)) {
                    return "$field must be a valid email";
                }
                break;

            case 'domain':
                if (!preg_match('/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9][a-z0-9-]{0,61}[a-z0-9]$/i', $value)) {
                    return "$field must be a valid domain";
                }
                break;

            case 'alpha_dash':
                if (!preg_match('/^[a-z0-9-_]+$/i', $value)) {
                    return "$field may only contain letters, numbers, dashes and underscores";
                }
                break;

            case 'numeric':
                if (!is_numeric($value)) {
                    return "$field must be numeric";
                }
                break;

            case 'integer':
                if (!filter_var($value, FILTER_VALIDATE_INT)) {
                    return "$field must be an integer";
                }
                break;

            case 'url':
                if (!filter_var($value, FILTER_VALIDATE_URL)) {
                    return "$field must be a valid URL";
                }
                break;
        }

        return null;
    }
}
