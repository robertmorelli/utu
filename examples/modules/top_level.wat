(module
  (rec
    (type $Utu1oqp5sdPairPair (struct
      (field $left i32)
      (field $right i32)
    ))
    (type $Utu1oqp5sdPairNotpair (struct
      (field $one i32)
    ))
  )
  (func $__utu_pair_1oqp5sd_pair_new (param $left i32) (param $right i32)  (result (ref $Utu1oqp5sdPairPair))
    local.get $left
    local.get $right
    struct.new $Utu1oqp5sdPairPair
  )
  (func $__utu_pair_1oqp5sd_pair_left (param $self (ref $Utu1oqp5sdPairPair))  (result i32)
    local.get $self
    struct.get $Utu1oqp5sdPairPair $left
  )
  (func $__utu_pair_1oqp5sd_pair_right (param $self (ref $Utu1oqp5sdPairPair))  (result i32)
    local.get $self
    struct.get $Utu1oqp5sdPairPair $right
  )
  (func $__utu_pair_1oqp5sd_not_pair_only (param $self (ref $Utu1oqp5sdPairNotpair))  (result i32)
    local.get $self
    struct.get $Utu1oqp5sdPairNotpair $one
  )
  (func $maybe_pair (param $flag i32)  (result (ref null $Utu1oqp5sdPairPair))
    local.get $flag
    (if (result (ref null $Utu1oqp5sdPairPair))
      (then
        i32.const 2
        i32.const 9
        call $__utu_pair_1oqp5sd_pair_new
      )
      (else
        ref.null $Utu1oqp5sdPairPair
      )
    )
  )
)