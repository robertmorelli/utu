(module
  (type $Shape (sub (struct)))
  (type $Circle (sub $Shape (struct
      (field $radius i32)
  )))
  (type $Rect (sub $Shape (struct
      (field $width i32)
      (field $height i32)
  )))
  (type $Triangle (sub $Shape (struct
      (field $base i32)
      (field $height i32)
  )))
  (import "__strings" "0" (global $__s0 externref))
  (import "__strings" "1" (global $__s1 externref))
  (import "__strings" "2" (global $__s2 externref))
  (import "__strings" "3" (global $__s3 externref))
  (import "__strings" "4" (global $__s4 externref))
  (import "__strings" "5" (global $__s5 externref))
  (import "" "0" (func $str_eq (param externref) (param externref) (result i32)))
  (func $area (param $shape (ref $Shape))  (result i32)
    (local $c (ref $Circle))
    (local $r (ref $Rect))
    (local $t (ref $Triangle))
    (block $__alt_exit_168440 (result i32)
      (block $__alt_168440_2 (result (ref $Triangle))
      (block $__alt_168440_1 (result (ref $Rect))
      (block $__alt_168440_0 (result (ref $Circle))
    local.get $shape
    br_on_cast $__alt_168440_0 (ref $Shape) (ref $Circle)
    br_on_cast $__alt_168440_1 (ref $Shape) (ref $Rect)
    br_on_cast $__alt_168440_2 (ref $Shape) (ref $Triangle)
    unreachable
    )
    local.set $c
    local.get $c
    struct.get $Circle $radius
    local.get $c
    struct.get $Circle $radius
    i32.mul
    br $__alt_exit_168440
    )
    local.set $r
    local.get $r
    struct.get $Rect $width
    local.get $r
    struct.get $Rect $height
    i32.mul
    br $__alt_exit_168440
    )
    local.set $t
    local.get $t
    struct.get $Triangle $base
    local.get $t
    struct.get $Triangle $height
    i32.mul
    i32.const 2
    i32.div_s
    )
  )
  (func $describe (param $shape (ref $Shape))  (result externref)
    (block $__alt_exit_170816 (result externref)
      (block $__alt_170816_2 (result (ref $Triangle))
      (block $__alt_170816_1 (result (ref $Rect))
      (block $__alt_170816_0 (result (ref $Circle))
    local.get $shape
    br_on_cast $__alt_170816_0 (ref $Shape) (ref $Circle)
    br_on_cast $__alt_170816_1 (ref $Shape) (ref $Rect)
    br_on_cast $__alt_170816_2 (ref $Shape) (ref $Triangle)
    unreachable
    )
    drop
    global.get $__s0
    br $__alt_exit_170816
    )
    drop
    global.get $__s1
    br $__alt_exit_170816
    )
    drop
    global.get $__s2
    )
  )
  (func $tag (param $kind i32)  (result externref)
    (local $__match_subj_173320 i32)
    local.get $kind
    local.set $__match_subj_173320
    local.get $__match_subj_173320
    i32.const 0
    i32.eq
    (if (result externref)
      (then
        global.get $__s3
      )
      (else
        local.get $__match_subj_173320
        i32.const 1
        i32.eq
        (if (result externref)
          (then
            global.get $__s4
          )
          (else
            global.get $__s5
          )
        )
      )
    )
  )
)